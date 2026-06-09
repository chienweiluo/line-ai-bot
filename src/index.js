import "dotenv/config";
import express from "express";
import { middleware } from "@line/bot-sdk";
import { handleEvent } from "./handler.js";

const required = ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET", "ANTHROPIC_API_KEY"];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing env var: ${key}`);
    process.exit(1);
  }
}

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

const app = express();

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/webhook", middleware(lineConfig), async (req, res) => {
  res.status(200).end();
  const events = req.body.events ?? [];
  await Promise.all(
    events.map((e) =>
      handleEvent(e).catch((err) => console.error("[webhook] event failed:", err))
    )
  );
});

app.use((err, _req, res, _next) => {
  console.error("[express] error:", err);
  res.status(err.statusCode || 500).end();
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`line-ai-bot listening on :${port}`);
});
