import { messagingApi } from "@line/bot-sdk";
import { ask } from "./anthropic.js";
import {
  appendTurn,
  getHistory,
  listFacts,
  rememberFact,
  bufferImage,
  consumePendingImages,
  storeIncomingMessage,
  storeBotMessages,
  lookupMessage,
} from "./memory.js";
import { buildPlacesCarousel } from "./flex.js";

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const blobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const MAX_IMAGES_PER_TURN = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function downloadImage(messageId) {
  const stream = await blobClient.getMessageContent(messageId);
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > MAX_IMAGE_BYTES) throw new Error("image too large");
    chunks.push(chunk);
  }
  const buf = Buffer.concat(chunks);
  const mime = detectImageMime(buf);
  return { buffer: buf, mimeType: mime };
}

function detectImageMime(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  if (buf[0] === 0x52 && buf[1] === 0x49) return "image/webp";
  return "image/jpeg";
}

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

function splitTextForLine(text) {
  if (text.length <= MAX_TEXT_LEN) return [text];
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_TEXT_LEN) {
    chunks.push(text.slice(i, i + MAX_TEXT_LEN));
  }
  return chunks.slice(0, 4);
}

async function reply(replyToken, payloads) {
  const messages = payloads.flat().slice(0, 5);
  return await lineClient.replyMessage({ replyToken, messages });
}

const LINE_REPLY_MAX = 5;

function buildReplyPayloads({ text, placeGroups }) {
  const textMessages = splitTextForLine(text).map((t) => ({ type: "text", text: t }));
  const messages = textMessages.slice(0, 1);
  const remainingSlots = LINE_REPLY_MAX - messages.length;

  if (placeGroups?.length) {
    const groups = placeGroups.slice(0, remainingSlots);
    for (const g of groups) {
      messages.push(buildPlacesCarousel(g.places, g.query));
    }
    if (placeGroups.length > groups.length) {
      const dropped = placeGroups.slice(groups.length).map((g) => g.query).join("、");
      console.warn(`[handler] dropped ${placeGroups.length - groups.length} place groups (LINE 5-msg limit): ${dropped}`);
    }
  } else if (textMessages.length > 1) {
    messages.push(...textMessages.slice(1, LINE_REPLY_MAX));
  }

  return messages;
}

async function handleImageMessage(event) {
  try {
    const { buffer, mimeType } = await downloadImage(event.message.id);
    bufferImage(event, mimeType, buffer);
    console.log(`[handler] buffered image ${event.message.id} (${buffer.length}B ${mimeType})`);
  } catch (err) {
    console.error("[handler] image download failed:", err);
  }
}

export async function handleEvent(event) {
  if (event.type === "join") {
    await reply(event.replyToken, [
      {
        type: "text",
        text: `大家好,我是 ${process.env.BOT_NAME || "AI 助手"} 🛺 在群裡 @我 就能幫你聊泰國旅遊、查店家、規劃行程。
也可以傳圖片給我看(菜單、景點、收據都行) — 傳完之後 @我 加問題,我就會看圖回答 📸
試試看「@我 曼谷有什麼好吃 pad thai」🍤`,
      },
    ]);
    return;
  }

  if (event.type !== "message") return;

  if (event.message.type === "image") {
    await handleImageMessage(event);
    return;
  }

  if (event.message.type !== "text") return;

  storeIncomingMessage(event);

  const quotedId = event.message.quotedMessageId;
  const quoted = quotedId ? lookupMessage(quotedId) : null;
  const repliedToBot = quoted?.isBot === true;

  const src = event.source;
  const isGroup = src.type === "group" || src.type === "room";
  const mentioned = botWasMentioned(event.message);
  if (isGroup && !mentioned && !repliedToBot) return;

  const userText = stripMentions(event.message);
  const pendingImages = consumePendingImages(event).slice(0, MAX_IMAGES_PER_TURN);

  if (!userText && pendingImages.length === 0 && !quoted) {
    await reply(event.replyToken, [
      { type: "text", text: "你叫我但沒講話,有什麼想問的?" },
    ]);
    return;
  }

  try {
    const history = getHistory(event);
    const facts = listFacts(event);
    const newFacts = [];
    const result = await ask({
      history,
      facts,
      userText,
      images: pendingImages,
      quoted,
      onFactSaved: (fact) => newFacts.push(fact),
    });

    for (const f of newFacts) rememberFact(event, f);
    const tags = [];
    if (pendingImages.length) tags.push(`附 ${pendingImages.length} 張圖`);
    if (quoted) tags.push(`引用「${quoted.text.slice(0, 30)}...」`);
    const storedUserText = tags.length
      ? `${userText || "(看圖)"} [${tags.join(", ")}]`
      : userText;
    appendTurn(event, storedUserText, result.text);

    const payloads = buildReplyPayloads(result);
    if (event.message.quoteToken && payloads[0]?.type === "text") {
      payloads[0] = { ...payloads[0], quoteToken: event.message.quoteToken };
    }

    const sendResult = await reply(event.replyToken, payloads);
    const sentTexts = payloads.filter((p) => p.type === "text").map((p) => p.text);
    if (sendResult?.sentMessages?.length) {
      storeBotMessages(event, sendResult.sentMessages, sentTexts);
    }
  } catch (err) {
    console.error("[handleEvent] failed:", err);
    try {
      await reply(event.replyToken, [
        { type: "text", text: "抱歉,剛才出了點問題,請稍後再試 🙏" },
      ]);
    } catch (replyErr) {
      console.error("[handleEvent] failed to send error reply:", replyErr);
    }
  }
}
