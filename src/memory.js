import {
  appendMessage,
  loadHistory,
  pruneHistory,
  addFact,
  getFacts,
  removeFact,
  addPendingImage,
  takePendingImages,
  pruneExpiredImages,
  recordMessage,
  getMessageById,
  pruneOldMessages,
  addExpense,
  getExpensesInRange,
  getRecentExpenses,
  removeExpense,
  pruneOldExpenses,
} from "./db.js";

const IMAGE_TTL_MS = Number(process.env.IMAGE_TTL_MINUTES ?? 10) * 60 * 1000;
const MESSAGE_TTL_MS = Number(process.env.MESSAGE_TTL_DAYS ?? 7) * 24 * 60 * 60 * 1000;
const EXPENSE_TTL_MS = Number(process.env.EXPENSE_TTL_DAYS ?? 6) * 24 * 60 * 60 * 1000;

const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT ?? 10);
const TTL_MS = Number(process.env.HISTORY_TTL_MINUTES ?? 60) * 60 * 1000;

export function convKey(event) {
  const src = event.source;
  if (src.type === "group") return `group:${src.groupId}`;
  if (src.type === "room") return `room:${src.roomId}`;
  return `user:${src.userId}`;
}

export function getHistory(event) {
  const key = convKey(event);
  return loadHistory(key, { limitTurns: HISTORY_LIMIT, ttlMs: TTL_MS });
}

export function appendTurn(event, userText, assistantText) {
  const key = convKey(event);
  appendMessage(key, "user", userText);
  appendMessage(key, "assistant", assistantText);
  pruneHistory(key, TTL_MS);
}

export function listFacts(event) {
  return getFacts(convKey(event));
}

export function rememberFact(event, fact) {
  addFact(convKey(event), fact);
}

export function forgetFact(event, id) {
  return removeFact(convKey(event), id);
}

export function bufferImage(event, mimeType, buffer) {
  const senderId = event.source.userId ?? "anonymous";
  addPendingImage(convKey(event), senderId, event.message.id, mimeType, buffer);
  pruneExpiredImages(IMAGE_TTL_MS);
}

export function consumePendingImages(event) {
  const senderId = event.source.userId ?? "anonymous";
  return takePendingImages(convKey(event), senderId, IMAGE_TTL_MS);
}

export function storeIncomingMessage(event) {
  if (event.message.type !== "text") return;
  recordMessage({
    messageId: event.message.id,
    convKey: convKey(event),
    senderId: event.source.userId ?? null,
    text: event.message.text,
    isBot: false,
  });
  pruneOldMessages(MESSAGE_TTL_MS);
}

export function storeBotMessages(event, sentMessages, texts) {
  for (let i = 0; i < sentMessages.length && i < texts.length; i++) {
    recordMessage({
      messageId: sentMessages[i].id,
      convKey: convKey(event),
      senderId: null,
      text: texts[i],
      isBot: true,
    });
  }
}

export function lookupMessage(messageId) {
  return getMessageById(messageId);
}

export function recordExpense(event, row) {
  const id = addExpense({
    convKey: convKey(event),
    sourceMsgId: event.message?.id,
    ...row,
  });
  pruneOldExpenses(EXPENSE_TTL_MS);
  return id;
}

export function listExpensesInRange(event, since, until) {
  return getExpensesInRange(convKey(event), since, until);
}

export function listRecentExpenses(event, limit = 10) {
  return getRecentExpenses(convKey(event), limit);
}

export function deleteExpenseRecord(event, id) {
  return removeExpense(convKey(event), id);
}
