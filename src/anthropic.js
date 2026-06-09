import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const BOT_NAME = process.env.BOT_NAME || "AI 助手";

const SYSTEM_PROMPT = `你是一個叫「${BOT_NAME}」的 LINE 群組助手。
- 使用者會在群組裡 @ 你來問問題,只有被 @ 到時你才會收到訊息。
- 用繁體中文回答,語氣自然、簡潔。一般問題回答控制在 3-5 句,複雜問題才展開。
- 不要在回覆開頭重複 @使用者名稱,也不要加表情符號,除非使用者明顯在閒聊。
- 如果問題模糊,先請對方補充,而不是亂猜。
- 不知道就說不知道,不要編造事實。`;

export async function ask({ history, userText }) {
  const messages = [...history, { role: "user", content: userText }];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return text || "(沒有產生回覆,請再試一次)";
}
