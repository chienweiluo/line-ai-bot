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
