const HISTORY_LIMIT = Number(process.env.HISTORY_LIMIT ?? 10);
const TTL_MS = Number(process.env.HISTORY_TTL_MINUTES ?? 60) * 60 * 1000;

const store = new Map();

function key(event) {
  const src = event.source;
  if (src.type === "group") return `group:${src.groupId}`;
  if (src.type === "room") return `room:${src.roomId}`;
  return `user:${src.userId}`;
}

export function getHistory(event) {
  const k = key(event);
  const entry = store.get(k);
  if (!entry) return [];
  if (Date.now() - entry.updatedAt > TTL_MS) {
    store.delete(k);
    return [];
  }
  return entry.messages;
}

export function appendTurn(event, userText, assistantText) {
  const k = key(event);
  const messages = getHistory(event).slice();
  messages.push({ role: "user", content: userText });
  messages.push({ role: "assistant", content: assistantText });
  while (messages.length > HISTORY_LIMIT * 2) messages.shift();
  store.set(k, { messages, updatedAt: Date.now() });
}
