import { messagingApi } from "@line/bot-sdk";
import { ask } from "./anthropic.js";
import { appendTurn, getHistory } from "./memory.js";

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const MAX_TEXT_LEN = 4900;

function botWasMentioned(message) {
  const mentionees = message.mention?.mentionees;
  if (!mentionees?.length) return false;
  return mentionees.some((m) => m.type === "user" && m.isSelf);
}

function stripMentions(message) {
  const text = message.text ?? "";
  const mentionees = message.mention?.mentionees;
  if (!mentionees?.length) return text.trim();
  const sorted = [...mentionees].sort((a, b) => b.index - a.index);
  let result = text;
  for (const m of sorted) {
    result = result.slice(0, m.index) + result.slice(m.index + m.length);
  }
  return result.trim();
}

function splitForLine(text) {
  if (text.length <= MAX_TEXT_LEN) return [text];
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_TEXT_LEN) {
    chunks.push(text.slice(i, i + MAX_TEXT_LEN));
  }
  return chunks.slice(0, 5);
}

async function reply(replyToken, text) {
  const messages = splitForLine(text).map((t) => ({ type: "text", text: t }));
  await lineClient.replyMessage({ replyToken, messages });
}

export async function handleEvent(event) {
  if (event.type === "join") {
    await reply(
      event.replyToken,
      `大家好,我是 ${process.env.BOT_NAME || "AI 助手"}。在群組裡 @我 + 問題,我就會回答 🙌`
    );
    return;
  }

  if (event.type !== "message" || event.message.type !== "text") return;

  const src = event.source;
  const isGroup = src.type === "group" || src.type === "room";

  if (isGroup && !botWasMentioned(event.message)) return;

  const userText = stripMentions(event.message);
  if (!userText) {
    await reply(event.replyToken, "你叫我但沒講話,有什麼想問的?");
    return;
  }

  try {
    const history = getHistory(event);
    const answer = await ask({ history, userText });
    appendTurn(event, userText, answer);
    await reply(event.replyToken, answer);
  } catch (err) {
    console.error("[handleEvent] failed:", err);
    try {
      await reply(event.replyToken, "抱歉,剛才出了點問題,請稍後再試 🙏");
    } catch (replyErr) {
      console.error("[handleEvent] failed to send error reply:", replyErr);
    }
  }
}
