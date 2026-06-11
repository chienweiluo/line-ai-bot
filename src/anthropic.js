import Anthropic from "@anthropic-ai/sdk";
import { searchPlaces } from "./google_places.js";
import { computeSettlements } from "./debts.js";

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const BOT_NAME = process.env.BOT_NAME || "AI 助手";
const MAX_TOOL_ITERATIONS = 5;

const BASE_PROMPT = `你是「${BOT_NAME}」,LINE 群組裡常駐的 AI 朋友 — 什麼都聊、什麼都能查。
個性熱情、直接、會吐槽、會偷推坑,像群裡那個博學又會玩的朋友。
你剛好對泰國 / 東南亞旅遊特別熟(跑了十年),但這只是你眾多熟悉領域之一,不是你的全部。

【角色與語氣】
- 用繁體中文,口語化:「欸」「靠」「真心不騙」「我跟你說」之類隨便丟。
- emoji 放開來用,每則 2-4 個剛好,情境符合就好 😎🔥💡🍻🌴。
- 一般問題 3-6 句,複雜的才展開。寧可分點清楚,也不要黏成一大段。
- 不知道就老實說「這個我沒研究過」,要的話幫忙查或建議他自己 Google,別瞎掰。
- 問題太模糊就先問清楚需求。
- 講話風格貼近朋友,不要假裝專業客服。

【⚠️ LINE 沒有 Markdown,千萬不要用】
- 不要寫 **粗體**、*斜體*、\`code\`、### 標題、--- 分隔線、表格、HTML。
- 不要用 - 或 * 開頭做條列(會看到原始符號)。
- 要分點就用「①②③」或「1. 2. 3.」或直接換行 + emoji。
- 要強調就用「」括起來,或用全形空白拉開,不要靠粗體。
- 要分段就用空白行,不要用標題或分隔線。

【你能聊的範圍 — 基本上什麼都行】
旅遊 / 美食 / 文化 / 語言、程式 / 工程 / 設計 / 科技 / AI、
職涯 / 創業 / 投資 / 加密貨幣、心理 / 關係 / 育兒 / 健康 / 健身、
影視 / 音樂 / 漫畫 / 遊戲、時事 / 政治 / 社會 / 歷史、
學術 / 數學 / 哲學、生活技能、隨便閒聊、抒發…
什麼都先想能不能正常回答,**不要動不動推給「我主要是旅遊」**。
有問題就答,沒研究就老實說沒研究,不要找藉口推回去。

【強項深度:泰國 / 東南亞旅遊】
雖然什麼都能聊,但被問到泰國 / 東南亞時,你的回答品質會比其他主題深一截:
行程規劃、交通、住宿、美食、景點、夜生活、按摩 / Spa、
文化禮儀(廟裡規矩、皇室禁忌、wai 合掌)、實用資訊(簽證、SIM、匯率、Grab vs Bolt)、
觀光客陷阱(寶石詐騙、tuk-tuk 帶去鴿子店、泰拳賭場仙人跳)、泰文小教學。
其他國家旅遊也能聊,只是深度沒這麼變態。

【內容尺度】
正常成年人能講的主題都可以正常講 — 事實 / 教育 / 文化角度處理就好:
- 藥物 / 大麻 / 酒類:各國法規、效果、風險、harm reduction。
- 性 / 關係 / 紅燈區 / 按摩(正常 / 半套 / 全套):實況、識別正當店家、健康風險。
- 賭博 / 投機 / 加密貨幣:在地法規、操作風險。
- 政治 / 宗教 / 歷史爭議:中性資訊性,不要說教。
- 派對藥物 / 極限運動:風險 + harm reduction。
態度像有經驗的朋友在分享資訊,不是說教也不是拒絕。
提到風險就一兩句帶過,不要每段都掛免責聲明。
泰國皇室仍是少數絕對不能開玩笑的主題(lèse-majesté 罪很重)— 客觀講可以,嘲諷別玩。

【會拒絕的少數情況】
教人實際走私 / 製毒 / 製武器 / 詐騙的具體 SOP。
針對特定個人的傷害 / 跟蹤 / 詐騙手法。
兒童相關的不當內容(包含 sex tourism 涉及未成年,直接拒絕並警告)。
拒絕時簡短一句帶過,不要長篇說教。

【你有上網查資料的能力 (web_search)】
任何需要「即時 / 最新 / 會變動」的資訊主動搜尋,不要硬猜:
新聞、股價、匯率、天氣、簽證、法規、最新版本 / 新發佈、近期事件、店家是否還在營業、節慶日期等。
一般常識 / 歷史事實 / 基礎知識直接答,別浪費搜尋額度。
搜到的資訊用自己的話講,有來源就提一句即可。
結果衝突或搜不到就老實說「網路資料有點混亂,你最好再 double check」。

【你有查真實店家資料的工具 (search_places)】
推薦「具體店家、餐廳、景點、咖啡廳、酒吧、按摩、健身房」之類有實體位置的東西就用 search_places。
**不限地區** — 曼谷、東京、台北、紐約、巴黎 Google Places 都有。
工具會回真實 Google Maps 資料,系統會自動再幫你出卡片(照片 + 評分 + 地圖按鈕),
所以你的文字回覆不用列出地址跟連結 — 講一兩句推薦理由就好,卡片會接著出現。
不是具體店家就不要叫(例:「程式 bug 怎麼修」「東京地鐵怎麼搭」)。

【你可以看圖片】
使用者傳了圖片,圖會直接出現在你的視野裡。看到圖直接做事,不用反問(除非太模糊)。
常見場景:菜單翻譯、景點 / 物品 / 植物識別、收據 / 帳單分析、
表單 / 截圖內容解讀、程式錯誤 screenshot 除錯、設計稿評論、
車票 / 機票提醒、簽證表填寫…

【你有群組記憶能力 (remember_fact)】
記住關於這個群組或成員的事實,以後對話自動帶進來。
記:明確指令(「記住我吃素」)、自然出現的偏好 / 限制 / 背景、群組決定 / 專案目標。
不記:一次性問題、已記過的、會頻繁變動的(「我現在在曼谷」)。
記完後簡短回應「OK 記下來了」即可,不要把記下的東西整段複述。

【你有記帳能力 (record_expense / query_expenses / delete_expense / compute_debts)】
群組常用來分帳(旅遊、共同採購、合租之類)。
- 明確報帳 / 描述付了某筆 → record_expense
- 問結算 / 算錢 / 誰欠誰 / 誰花最多 → query_expenses,需要誰欠誰時加 compute_debts
- 要刪某筆 → 先 query 找 → delete_expense
幣別:沒講就視對話線索推測,泰國情境預設 THB。
時間範圍:
- 「今天」:從當地時間 00:00 開始
- 「這趟」「整趟」:預設過去 6 天(TTL 上限),除非另有說明
- 「昨天」「上週」:推算 ISO 時間
列出來時用「①②③」加 emoji,不要 markdown。`;

function buildSystemPrompt(facts) {
  if (!facts?.length) return BASE_PROMPT;
  const factList = facts.map((f) => `- ${f.fact}`).join("\n");
  return `${BASE_PROMPT}\n\n【關於這個群組,你之前記下的事】\n${factList}`;
}

const TOOLS = [
  {
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 5,
  },
  {
    name: "search_places",
    description:
      "用 Google Places 查真實店家資料(餐廳、景點、按摩、酒吧、咖啡廳等具體有實體位置的東西)。系統會自動把結果做成 Flex 卡片附在訊息後面。",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "搜尋字串,例如「曼谷 pad thai」「清邁古城 cafe」「Phuket sunset bar」。建議含城市/區域 + 類型/關鍵字。",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "remember_fact",
    description:
      "把關於這個群組或成員的事實記下來,以後每次對話會自動帶進你的記憶。適合記偏好、限制、背景、決定。不要記一次性的問題。",
    input_schema: {
      type: "object",
      properties: {
        fact: {
          type: "string",
          description:
            "要記住的事實,寫成完整一句話,例:「阿哲吃素不吃牛」「群組預算每人 5 萬台幣」「12 月初要去清邁 7 天」。",
        },
      },
      required: ["fact"],
    },
  },
  {
    name: "record_expense",
    description:
      "把一筆花費存進資料庫。使用者明確報帳或描述付了某筆錢時用。預設付款人 = 訊息發送者。",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "金額(純數字)" },
        currency: {
          type: "string",
          description: "幣別 ISO 代碼,例 THB / TWD / USD / JPY。沒講就預設 THB(泰國旅遊情境)。",
        },
        item: { type: "string", description: "花在什麼,簡短描述(例:午餐、按摩、計程車)" },
        split: {
          type: "string",
          enum: ["self", "split_equal", "paid_for_others"],
          description: "self = 個人花費;split_equal = 付款人和 other_names 平分;paid_for_others = 付款人代付給 other_names",
        },
        other_names: {
          type: "array",
          items: { type: "string" },
          description: "split 涉及的其他人名/暱稱(從訊息文字看到的)。__all__ 代表「大家」。",
        },
        payer_name: {
          type: "string",
          description: "明確指定付款人名字(預設是訊息發送者,僅在使用者說『X 付的』時使用)",
        },
      },
      required: ["amount", "currency", "item", "split"],
    },
  },
  {
    name: "query_expenses",
    description:
      "查詢花費記錄。可指定時間範圍(unix ms)。不指定就回最近 N 筆。最多 6 天內(這是 TTL)。",
    input_schema: {
      type: "object",
      properties: {
        since: { type: "number", description: "起始 unix ms(包含)" },
        until: { type: "number", description: "結束 unix ms(包含)" },
        recent_limit: { type: "number", description: "若不指定 since/until,回最近 N 筆,預設 20" },
      },
    },
  },
  {
    name: "delete_expense",
    description: "刪除一筆花費,需要 id(從 query_expenses 拿)。",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "number", description: "要刪除的 expense id" },
      },
      required: ["id"],
    },
  },
  {
    name: "compute_debts",
    description:
      "依照指定範圍內的花費,計算最少 transfer 的「誰該付誰多少」清單。同幣別會分組。",
    input_schema: {
      type: "object",
      properties: {
        since: { type: "number", description: "起始 unix ms" },
        until: { type: "number", description: "結束 unix ms" },
      },
    },
  },
];

function buildQuotedPrefix(quoted) {
  if (!quoted?.text) return "";
  const speaker = quoted.isBot ? "你之前說" : "另一個人說";
  return `[使用者正在回覆 / 引用以下訊息]\n${speaker}:「${quoted.text}」\n\n[使用者的回覆]\n`;
}

function buildUserContent(userText, images, quoted) {
  const prefix = buildQuotedPrefix(quoted);
  const fullText = prefix + (userText || (images?.length ? "看一下這張圖" : ""));
  if (!images?.length) return fullText;
  const blocks = images.map((img) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: img.mimeType || "image/jpeg",
      data: Buffer.isBuffer(img.data) ? img.data.toString("base64") : img.data,
    },
  }));
  blocks.push({ type: "text", text: fullText });
  return blocks;
}

export async function ask({ history, facts, userText, images, quoted, onFactSaved, expenseOps }) {
  const messages = [
    ...history,
    { role: "user", content: buildUserContent(userText, images, quoted) },
  ];
  const systemPrompt = buildSystemPrompt(facts);

  const placeGroups = [];
  let finalResponse = null;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: [
        { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      tools: TOOLS,
      messages,
    });

    finalResponse = response;
    if (response.stop_reason !== "tool_use") break;

    messages.push({ role: "assistant", content: response.content });
    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const toolResults = [];

    for (const tu of toolUses) {
      try {
        if (tu.name === "search_places") {
          const places = await searchPlaces({ query: tu.input.query });
          if (places.length) {
            placeGroups.push({ query: tu.input.query, places: places.slice(0, 5) });
          }
          const summary = places.slice(0, 5).map((p) => ({
            name: p.name,
            rating: p.rating,
            ratings_count: p.ratingsCount,
            address: p.address,
            price: p.priceLevel,
          }));
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(summary),
          });
        } else if (tu.name === "remember_fact") {
          const fact = String(tu.input.fact ?? "").trim();
          if (fact) onFactSaved?.(fact);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: fact ? "saved" : "empty fact, nothing saved",
          });
        } else if (tu.name === "record_expense" && expenseOps?.record) {
          const id = expenseOps.record(tu.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify({ id, status: "recorded" }),
          });
        } else if (tu.name === "query_expenses" && expenseOps?.query) {
          const rows = expenseOps.query(tu.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(rows),
          });
        } else if (tu.name === "delete_expense" && expenseOps?.delete) {
          const ok = expenseOps.delete(tu.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: ok ? "deleted" : "not found",
          });
        } else if (tu.name === "compute_debts" && expenseOps?.compute) {
          const settlements = expenseOps.compute(tu.input);
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: JSON.stringify(settlements),
          });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: `unknown tool: ${tu.name}`,
            is_error: true,
          });
        }
      } catch (err) {
        console.error(`[tool ${tu.name}] failed:`, err);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: `tool failed: ${err.message}`,
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  const text =
    finalResponse?.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim() || "(沒有產生回覆,請再試一次)";

  return { text, placeGroups };
}
