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
  recordExpense,
  listExpensesInRange,
  listRecentExpenses,
  deleteExpenseRecord,
} from "./memory.js";
import { buildPlacesCarousel } from "./flex.js";
import {
  detectExpenseFromText,
  detectExpenseFromImage,
  looksLikeExpense,
} from "./expense_detector.js";
import { computeSettlements } from "./debts.js";
import { getDisplayName } from "./profile.js";

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const blobClient = new messagingApi.MessagingApiBlobClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const MAX_IMAGES_PER_TURN = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_LEN = 4900;
const LINE_REPLY_MAX = 5;
const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || "THB";
const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

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
  return { buffer: buf, mimeType: detectImageMime(buf) };
}

function detectImageMime(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  if (buf[0] === 0x52 && buf[1] === 0x49) return "image/webp";
  return "image/jpeg";
}

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

function buildReplyPayloads({ text, placeGroups }) {
  const textMessages = splitTextForLine(text).map((t) => ({ type: "text", text: t }));
  const messages = textMessages.slice(0, 1);
  const remainingSlots = LINE_REPLY_MAX - messages.length;

  if (placeGroups?.length) {
    const groups = placeGroups.slice(0, remainingSlots);
    for (const g of groups) messages.push(buildPlacesCarousel(g.places, g.query));
  } else if (textMessages.length > 1) {
    messages.push(...textMessages.slice(1, LINE_REPLY_MAX));
  }
  return messages;
}

function buildParticipants(input, payer) {
  const split = input.split || "self";
  const others = (input.other_names || []).filter((n) => n && n !== "__all__");
  const otherParticipants = others.map((n) => ({ id: `name:${n}`, name: n }));
  if (split === "split_equal") {
    return [{ id: payer.id, name: payer.name }, ...otherParticipants];
  }
  if (split === "paid_for_others") {
    return otherParticipants.length ? otherParticipants : [{ id: payer.id, name: payer.name }];
  }
  return [{ id: payer.id, name: payer.name }];
}

function buildExpenseOps(event, senderName) {
  const payerId = event.source.userId;
  return {
    record(input) {
      const payerName = input.payer_name ?? senderName ?? "未知";
      const participants = buildParticipants(input, { id: payerId, name: payerName });
      return recordExpense(event, {
        payerId,
        payerName,
        amount: Number(input.amount),
        currency: input.currency || DEFAULT_CURRENCY,
        item: input.item,
        participants,
      });
    },
    query(input) {
      if (input.since && input.until) {
        return listExpensesInRange(event, input.since, input.until);
      }
      return listRecentExpenses(event, input.recent_limit ?? 20);
    },
    delete(input) {
      return deleteExpenseRecord(event, Number(input.id));
    },
    compute(input) {
      const since = input.since ?? Date.now() - SIX_DAYS_MS;
      const until = input.until ?? Date.now();
      const expenses = listExpensesInRange(event, since, until);
      return computeSettlements(expenses);
    },
  };
}

function formatExpenseLine(payerName, item, amount, currency, participants) {
  const base = `🧾 ${payerName} · ${item} ${formatAmount(amount)} ${currency}`;
  if (!participants || participants.length <= 1) return base;
  const share = amount / participants.length;
  const names = participants.map((p) => p.name).join(" / ");
  return `${base}(${names} 平分,每人 ${formatAmount(share)})`;
}

function formatAmount(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

async function handleImageMessage(event) {
  try {
    const { buffer, mimeType } = await downloadImage(event.message.id);
    bufferImage(event, mimeType, buffer);
    console.log(`[handler] buffered image ${event.message.id} (${buffer.length}B ${mimeType})`);

    const src = event.source;
    const isGroup = src.type === "group" || src.type === "room";
    if (!isGroup && src.type !== "user") return;

    const detected = await detectExpenseFromImage({ buffer, mimeType }).catch((e) => {
      console.warn("[expense_detect:image] failed:", e.message);
      return null;
    });
    if (!detected?.is_receipt || !detected.amount) return;

    const senderName = (await getDisplayName(event)) ?? "某人";
    const item = detected.merchant ? `收據 (${detected.merchant})` : "收據";
    const participants = [{ id: src.userId, name: senderName }];
    const id = recordExpense(event, {
      payerId: src.userId,
      payerName: senderName,
      amount: Number(detected.amount),
      currency: detected.currency || DEFAULT_CURRENCY,
      item,
      participants,
    });

    const line = formatExpenseLine(senderName, item, detected.amount, detected.currency || DEFAULT_CURRENCY, participants);
    const text = `✓ 從收據認到一筆 #${id}\n${line}\n\n如果認錯了 @我 取消這筆`;
    await reply(event.replyToken, [{ type: "text", text }]);
  } catch (err) {
    console.error("[handler] image processing failed:", err);
  }
}

async function autoDetectAndConfirm(event) {
  const text = event.message.text;
  if (!looksLikeExpense(text)) return false;

  const senderName = (await getDisplayName(event)) ?? "某人";
  const detected = await detectExpenseFromText({ text, senderName }).catch((e) => {
    console.warn("[expense_detect:text] failed:", e.message);
    return null;
  });
  if (!detected?.is_expense || !Array.isArray(detected.expenses) || detected.expenses.length === 0) {
    return false;
  }

  const lines = [];
  const ids = [];
  for (const e of detected.expenses) {
    if (!e.amount || !e.currency || !e.item) continue;
    const participants = buildParticipants(e, { id: event.source.userId, name: senderName });
    const payerName = e.payer_name ?? senderName;
    const id = recordExpense(event, {
      payerId: event.source.userId,
      payerName,
      amount: Number(e.amount),
      currency: e.currency,
      item: e.item,
      participants,
    });
    ids.push(id);
    lines.push(formatExpenseLine(payerName, e.item, Number(e.amount), e.currency, participants));
  }
  if (!lines.length) return false;

  const header = ids.length === 1 ? `✓ 記到一筆 #${ids[0]}` : `✓ 記到 ${ids.length} 筆 (#${ids.join(", #")})`;
  const text2 = `${header}\n${lines.join("\n")}\n\n認錯了 @我 取消或修正`;
  await reply(event.replyToken, [
    { type: "text", text: text2, quoteToken: event.message.quoteToken },
  ]);
  return true;
}

export async function handleEvent(event) {
  if (event.type === "join") {
    await reply(event.replyToken, [
      {
        type: "text",
        text: `大家好,我是 ${process.env.BOT_NAME || "AI 助手"} 🛺
我會聊泰國旅遊,在群裡 @我 問問題即可。
📸 傳圖給我看 (菜單/景點/收據都行) → 之後 @我 加問題,我就會看圖回答
🧾 群裡有人講花費或傳收據,我會自動記下來,結算時 @我 「算今天」就會列出來

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

  if (isGroup && !mentioned && !repliedToBot) {
    try {
      await autoDetectAndConfirm(event);
    } catch (err) {
      console.error("[autoDetect] failed:", err);
    }
    return;
  }

  const userText = stripMentions(event.message);
  const pendingImages = consumePendingImages(event).slice(0, MAX_IMAGES_PER_TURN);

  if (!userText && pendingImages.length === 0 && !quoted) {
    await reply(event.replyToken, [{ type: "text", text: "你叫我但沒講話,有什麼想問的?" }]);
    return;
  }

  try {
    const history = getHistory(event);
    const facts = listFacts(event);
    const senderName = await getDisplayName(event);
    const newFacts = [];
    const expenseOps = buildExpenseOps(event, senderName);
    const result = await ask({
      history,
      facts,
      userText,
      images: pendingImages,
      quoted,
      onFactSaved: (fact) => newFacts.push(fact),
      expenseOps,
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
      await reply(event.replyToken, [{ type: "text", text: "抱歉,剛才出了點問題,請稍後再試 🙏" }]);
    } catch (replyErr) {
      console.error("[handleEvent] failed to send error reply:", replyErr);
    }
  }
}
