# line-ai-bot

LINE 群組 AI 助手。把它拉進群組,@它 + 問題,它會用 Anthropic Claude 回答。

## 架構

```
LINE 群組
   │ webhook (POST /webhook)
   ▼
Express + @line/bot-sdk middleware (驗 X-Line-Signature)
   │
   ▼
handler.js
   │  - 群組訊息只在被 @ 才處理(用 mentionee.isSelf 判斷)
   │  - 去掉 @bot 文字
   │  - 從 memory.js 取群組對話歷史(in-memory, 含 TTL)
   ▼
anthropic.js (Claude, system prompt 加 ephemeral cache)
   │
   ▼
MessagingApiClient.replyMessage (用 replyToken)
```

## 設定

1. 複製環境變數
   ```
   cp .env.example .env
   ```
   填入:
   - `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_CHANNEL_SECRET`(LINE Developers Console → Messaging API channel)
   - `ANTHROPIC_API_KEY`(console.anthropic.com)

2. 在 LINE Developers Console 的 Messaging API channel:
   - Webhook URL → 你的 `https://xxx/webhook`
   - Use webhook: **ON**
   - Auto-reply messages: **OFF**(否則官方預設訊息會搶在你的 bot 前面)
   - Greeting messages: 看需求
   - Allow bot to join group chats: **ON**

## 本地跑

```
npm install
npm run dev
```

另一個終端:
```
ngrok http 3000
```

把 ngrok 的 `https://xxx.ngrok-free.app/webhook` 填回 channel,按 Verify,把 bot 加入測試群組,@它問問題。

## 部署

任何能跑 Node 22 的平台都行(Render / Railway / Fly.io / Cloud Run)。設好上面三組環境變數,把 Webhook URL 換成正式網址。

## 注意事項

- `replyToken` 一分鐘內只能用一次,過期要改用 push API。
- 單則 text 上限 5000 字,handler 會自動切段。
- 對話歷史目前是 in-memory,重啟會清空。要持久化請改 Redis / DB。
- Rate limit / 群組濫用控制目前沒有,正式上線前建議加。
