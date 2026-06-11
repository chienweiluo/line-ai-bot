import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const HAIKU = process.env.HAIKU_MODEL || "claude-haiku-4-5-20251001";
const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || "THB";

const NUMBER_AND_HINT = /(?:\d{2,7}(?:[.,]\d+)?)\s*(?:銖|baht|THB|TWD|台幣|塊|元|NT\$?|圓|円|JPY|¥|USD|US\$|\$|EUR|€|HKD|港幣|RMB|人民幣|KRW|won|VND|đ|IDR|rp|PHP|SGD|MYR)/i;
const COST_VERB = /(花了|付了|買了|付掉|刷了|請客|平分|分攤|AA|分帳|加錢|匯了|轉帳|轉了)/;

export function looksLikeExpense(text) {
  if (!text) return false;
  if (NUMBER_AND_HINT.test(text)) return true;
  if (COST_VERB.test(text) && /\d{2,7}/.test(text)) return true;
  return false;
}

const TEXT_SYSTEM = `You extract expense info from LINE group-chat messages.

If no currency is mentioned in the message, assume ${DEFAULT_CURRENCY}.

Decide if the message states an expense the SENDER paid (or someone they name). If yes, extract structured info. Return JSON only — no prose.

Schema:
{
  "is_expense": boolean,
  "expenses": [
    {
      "amount": number,
      "currency": "THB" | "TWD" | "USD" | "JPY" | "EUR" | "HKD" | "CNY" | "KRW" | "VND" | "IDR" | "PHP" | "SGD" | "MYR",
      "item": string,
      "split": "self" | "split_equal" | "paid_for_others",
      "other_names": string[]
    }
  ]
}

Rules:
- "self" — sender paid for sender only
- "split_equal" — sender paid, the cost should be split equally between sender + other_names
- "paid_for_others" — sender paid on behalf of other_names (sender doesn't share cost)
- If message has multiple expenses, return them all in the "expenses" array
- Skip: budgets ("我預算 200 萬"), debts owed to sender ("他差我 500"), news prices, hypothetical sums
- "other_names" should be Chinese names / nicknames from the message text, NOT generic words like "大家". For "大家" use empty array but set split=split_equal with a "group_all" hint in other_names: ["__all__"]`;

const IMAGE_SYSTEM = `You determine if an image is a receipt or payment slip, and if so extract the total paid.

Return JSON only:
{
  "is_receipt": boolean,
  "amount": number | null,
  "currency": "THB" | "TWD" | "USD" | "JPY" | "EUR" | "HKD" | "CNY" | "KRW" | "VND" | "IDR" | "PHP" | "SGD" | "MYR" | null,
  "merchant": string | null
}

Default currency when ambiguous but clearly Thai context: THB.`;

function parseJsonLoose(text) {
  if (!text) return null;
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch {}
    }
    return null;
  }
}

export async function detectExpenseFromText({ text, senderName }) {
  const userMsg = senderName
    ? `Sender's display name: ${senderName}\nMessage: ${text}`
    : `Message: ${text}`;

  const response = await client.messages.create({
    model: HAIKU,
    max_tokens: 400,
    system: TEXT_SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });
  const raw = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return parseJsonLoose(raw);
}

export async function detectExpenseFromImage({ buffer, mimeType }) {
  const response = await client.messages.create({
    model: HAIKU,
    max_tokens: 300,
    system: IMAGE_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType || "image/jpeg",
              data: buffer.toString("base64"),
            },
          },
          { type: "text", text: "Is this a receipt? Extract per schema." },
        ],
      },
    ],
  });
  const raw = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return parseJsonLoose(raw);
}
