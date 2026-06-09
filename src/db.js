import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.DB_PATH || "./data/bot.db";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    conv_key TEXT NOT NULL,
    ts       INTEGER NOT NULL,
    role     TEXT NOT NULL,
    content  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_history_conv_ts ON history(conv_key, ts);

  CREATE TABLE IF NOT EXISTS facts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    conv_key   TEXT NOT NULL,
    fact       TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_facts_conv ON facts(conv_key);

  CREATE TABLE IF NOT EXISTS pending_images (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    conv_key    TEXT NOT NULL,
    sender_id   TEXT NOT NULL,
    message_id  TEXT NOT NULL,
    mime_type   TEXT NOT NULL,
    data        BLOB NOT NULL,
    received_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pending_lookup ON pending_images(conv_key, sender_id, received_at);

  CREATE TABLE IF NOT EXISTS messages (
    message_id  TEXT PRIMARY KEY,
    conv_key    TEXT NOT NULL,
    sender_id   TEXT,
    text        TEXT NOT NULL,
    is_bot      INTEGER NOT NULL DEFAULT 0,
    received_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conv_key, received_at);

  CREATE TABLE IF NOT EXISTS expenses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    conv_key      TEXT NOT NULL,
    payer_id      TEXT NOT NULL,
    payer_name    TEXT,
    amount        REAL NOT NULL,
    currency      TEXT NOT NULL,
    item          TEXT,
    participants  TEXT,
    source_msg_id TEXT,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_expenses_conv_time ON expenses(conv_key, created_at);

  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id      TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    updated_at   INTEGER NOT NULL
  );
`);

const insertHistory = db.prepare(
  "INSERT INTO history (conv_key, ts, role, content) VALUES (?, ?, ?, ?)"
);
const selectHistory = db.prepare(
  "SELECT role, content FROM history WHERE conv_key = ? AND ts > ? ORDER BY ts ASC LIMIT ?"
);
const deleteOldHistory = db.prepare(
  "DELETE FROM history WHERE conv_key = ? AND ts <= ?"
);

const insertFact = db.prepare(
  "INSERT INTO facts (conv_key, fact, created_at) VALUES (?, ?, ?)"
);
const selectFacts = db.prepare(
  "SELECT id, fact FROM facts WHERE conv_key = ? ORDER BY created_at ASC"
);
const deleteFact = db.prepare("DELETE FROM facts WHERE id = ? AND conv_key = ?");

export function appendMessage(convKey, role, content) {
  insertHistory.run(convKey, Date.now(), role, content);
}

export function loadHistory(convKey, { limitTurns, ttlMs }) {
  const cutoff = Date.now() - ttlMs;
  return selectHistory.all(convKey, cutoff, limitTurns * 2);
}

export function pruneHistory(convKey, ttlMs) {
  const cutoff = Date.now() - ttlMs;
  deleteOldHistory.run(convKey, cutoff);
}

export function addFact(convKey, fact) {
  insertFact.run(convKey, fact, Date.now());
}

export function getFacts(convKey) {
  return selectFacts.all(convKey);
}

export function removeFact(convKey, id) {
  return deleteFact.run(id, convKey).changes > 0;
}

const insertPendingImage = db.prepare(
  "INSERT INTO pending_images (conv_key, sender_id, message_id, mime_type, data, received_at) VALUES (?, ?, ?, ?, ?, ?)"
);
const selectPendingImages = db.prepare(
  "SELECT id, mime_type, data FROM pending_images WHERE conv_key = ? AND sender_id = ? AND received_at > ? ORDER BY received_at ASC"
);
const deletePendingImagesByIds = db.prepare(
  "DELETE FROM pending_images WHERE id IN (SELECT value FROM json_each(?))"
);
const deleteExpiredImages = db.prepare(
  "DELETE FROM pending_images WHERE received_at <= ?"
);

export function addPendingImage(convKey, senderId, messageId, mimeType, buffer) {
  insertPendingImage.run(convKey, senderId, messageId, mimeType, buffer, Date.now());
}

export function takePendingImages(convKey, senderId, ttlMs) {
  const cutoff = Date.now() - ttlMs;
  const rows = selectPendingImages.all(convKey, senderId, cutoff);
  if (rows.length) {
    deletePendingImagesByIds.run(JSON.stringify(rows.map((r) => r.id)));
  }
  return rows.map((r) => ({ mimeType: r.mime_type, data: r.data }));
}

export function pruneExpiredImages(ttlMs) {
  deleteExpiredImages.run(Date.now() - ttlMs);
}

const insertMessage = db.prepare(
  "INSERT OR IGNORE INTO messages (message_id, conv_key, sender_id, text, is_bot, received_at) VALUES (?, ?, ?, ?, ?, ?)"
);
const selectMessageById = db.prepare(
  "SELECT message_id, conv_key, sender_id, text, is_bot FROM messages WHERE message_id = ?"
);
const deleteOldMessages = db.prepare(
  "DELETE FROM messages WHERE received_at <= ?"
);

export function recordMessage({ messageId, convKey, senderId, text, isBot }) {
  insertMessage.run(
    messageId,
    convKey,
    senderId ?? null,
    text,
    isBot ? 1 : 0,
    Date.now()
  );
}

export function getMessageById(messageId) {
  const row = selectMessageById.get(messageId);
  if (!row) return null;
  return {
    messageId: row.message_id,
    convKey: row.conv_key,
    senderId: row.sender_id,
    text: row.text,
    isBot: row.is_bot === 1,
  };
}

export function pruneOldMessages(ttlMs) {
  deleteOldMessages.run(Date.now() - ttlMs);
}

const insertExpense = db.prepare(
  `INSERT INTO expenses (conv_key, payer_id, payer_name, amount, currency, item, participants, source_msg_id, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const selectExpensesRange = db.prepare(
  "SELECT id, conv_key, payer_id, payer_name, amount, currency, item, participants, source_msg_id, created_at FROM expenses WHERE conv_key = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at ASC"
);
const selectRecentExpenses = db.prepare(
  "SELECT id, conv_key, payer_id, payer_name, amount, currency, item, participants, source_msg_id, created_at FROM expenses WHERE conv_key = ? ORDER BY created_at DESC LIMIT ?"
);
const deleteExpense = db.prepare("DELETE FROM expenses WHERE id = ? AND conv_key = ?");
const deleteOldExpenses = db.prepare("DELETE FROM expenses WHERE created_at <= ?");

export function addExpense(row) {
  const result = insertExpense.run(
    row.convKey,
    row.payerId,
    row.payerName ?? null,
    row.amount,
    row.currency,
    row.item ?? null,
    row.participants ? JSON.stringify(row.participants) : null,
    row.sourceMsgId ?? null,
    Date.now()
  );
  return result.lastInsertRowid;
}

function rowToExpense(r) {
  return {
    id: r.id,
    convKey: r.conv_key,
    payerId: r.payer_id,
    payerName: r.payer_name,
    amount: r.amount,
    currency: r.currency,
    item: r.item,
    participants: r.participants ? JSON.parse(r.participants) : null,
    sourceMsgId: r.source_msg_id,
    createdAt: r.created_at,
  };
}

export function getExpensesInRange(convKey, since, until) {
  return selectExpensesRange.all(convKey, since, until).map(rowToExpense);
}

export function getRecentExpenses(convKey, limit = 10) {
  return selectRecentExpenses.all(convKey, limit).map(rowToExpense);
}

export function removeExpense(convKey, id) {
  return deleteExpense.run(id, convKey).changes > 0;
}

export function pruneOldExpenses(ttlMs) {
  deleteOldExpenses.run(Date.now() - ttlMs);
}

const upsertProfile = db.prepare(
  "INSERT INTO user_profiles (user_id, display_name, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at"
);
const selectProfile = db.prepare(
  "SELECT user_id, display_name, updated_at FROM user_profiles WHERE user_id = ?"
);

export function saveProfile(userId, displayName) {
  upsertProfile.run(userId, displayName, Date.now());
}

export function getProfile(userId) {
  const row = selectProfile.get(userId);
  if (!row) return null;
  return { userId: row.user_id, displayName: row.display_name, updatedAt: row.updated_at };
}
