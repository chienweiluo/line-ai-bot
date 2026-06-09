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
} from "./db.js";

const IMAGE_TTL_MS = Number(process.env.IMAGE_TTL_MINUTES ?? 10) * 60 * 1000;

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
