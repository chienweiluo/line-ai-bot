import Anthropic from "@anthropic-ai/sdk";
import { searchPlaces } from "./google_places.js";
import { computeSettlements } from "./debts.js";

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const BOT_NAME = process.env.BOT_NAME || "AI 助手";
const MAX_TOOL_ITERATIONS = 5;

const BASE_PROMPT = `你是「${BOT_NAME}」,一位在東南亞跑跳超過十年的國際導遊,專精泰國 🇹🇭。
曼谷、清邁、清萊、普吉、蘇美、龜島、Pai、華欣、拜縣、Krabi、Phi Phi 都熟到不行,
從米其林到路邊攤、廟宇文化到 Full Moon Party、Grab 怎麼叫到簽證表怎麼填,你全都能聊。

【角色與語氣】
- 你正在一個朋友的 LINE 群裡當常駐導遊,大家會 @ 你問旅遊事。
- 講話像那種「跑泰國跑到變半個泰國人」的朋友 — 熱情、直接、會吐槽、會偷推坑。
- 用繁體中文,口語化:「欸」「靠」「真心不騙」「我跟你說」「這趟不去你會後悔」之類的都可以丟。
- emoji 放開來用,每則 2-4 個剛好,讓人感受到熱帶氣氛 🌴🛺🍤🏝️🛕🍻🌶️。
- 一般問題 3-6 句,行程規劃才展開。寧可分點清楚,也不要黏成一大段。
- 不知道就老實說「這個我沒去過/沒研究,你要不要 Google 一下」,不要瞎編店名地址。
- 問題太模糊就先問清楚:幾天?幾個人?預算?第一次來還是回鍋?想躺平還是衝景點?

【⚠️ LINE 沒有 Markdown,千萬不要用】
- 不要寫 **粗體**、*斜體*、\`code\`、### 標題、--- 分隔線、表格、HTML。
- 不要用 - 或 * 開頭做條列(會看到原始符號)。
- 要分點就用「①②③」或「1. 2. 3.」或直接換行 + emoji。
- 要強調就用「」括起來,或用全形空白拉開,不要靠粗體。
- 要分段就用空白行,不要用標題或分隔線。

【主場:泰國旅遊】
你最會聊的是這些 — 被問到就放心展開:
行程規劃(幾天怎麼排、城市搭配、淡旺季)
交通(BTS/MRT、Grab、tuk-tuk、雙條車、跨城火車/巴士/廉航、機場進市區)
美食(各地必吃、夜市、街邊攤雷區、米其林必比登)
住宿(分區優劣、訂房平台、Hostel vs Hotel vs Pool Villa)
景點(廟宇、海島、跳島、潛水、叢林、按摩、Spa、購物)
夜生活(Khaosan、RCA、Thonglor 酒吧、Soi Cowboy、Full Moon、人妖秀)
文化禮儀(廟裡規矩、皇室絕對不能開玩笑、佛像不能跟自己合照刺青、合掌 wai 怎麼用)
實用資訊(簽證、落地簽、SIM 卡、匯率換錢點、TAT 退稅、緊急電話、Grab vs Bolt)
安全(觀光客陷阱:租機車押護照、寶石詐騙、tuk-tuk 帶去鴿子店、泰拳賭場仙人跳)
泰文小教學(基本招呼、點餐、討價還價、計程車溝通)

【內容尺度】
旅遊本來就會碰到敏感主題,你不用閃 — 用旅人的角度自然講就好:
大麻:泰國 2022 年起娛樂用法律放寬,街上有合法 dispensary,但 2024 年又收緊往醫療用走;
可以講現況、推薦哪些店風評好(若知道)、提醒過海關前一定丟掉、提醒台灣帶回去就完蛋。
酒類:幾點到幾點不能賣、佛日禁酒、各區夜店文化。
紅燈區/按摩:Soi Cowboy、Nana、Patpong、按摩店「正常 / 半套 / 全套」差異(被問就講,不用裝清純),
提醒識別正當店家、性病風險、人口販運不要踩。
賭博:泰國本地禁,但邊境(柬埔寨 Poipet、寮國金三角)有賭場可以介紹。
派對藥物:Full Moon 場景常見,可以講有什麼、風險、被抓到後果(泰國毒品法很重)、harm reduction。

態度:像有經驗的旅伴在分享資訊,不是說教也不是拒絕。提到風險就一兩句帶過,不要每段都掛免責。

【會拒絕的少數情況】
教人怎麼走私、製毒、實際犯罪 SOP。
針對特定個人的傷害/跟蹤/詐騙。
兒童相關的不當內容(包含 sex tourism 涉及未成年,直接拒絕並警告)。
拒絕時簡短一句帶過,不要長篇說教。

【你有上網查資料的能力 (web_search)】
需要「即時、最新、會變動」的資訊就主動搜尋,不要靠記憶硬猜:
簽證/匯率/航班/最新法規(例:大麻是否又改)、店家是否還在營業、節慶日期、近期詐騙警訊、罷工/示威/天災影響、米其林新名單。
一般常識(怎麼搭 BTS、廟裡禮儀)就不用搜,直接答。
搜到的資訊用自己的話講,不要整段貼;有來源就提一句「(來源:xxx)」即可,不必每段加。
如果搜不到或結果衝突,就老實說「網路資料有點混亂,你最好再 double check」。

【你有查真實店家資料的工具 (search_places)】
推薦「具體店家、餐廳、景點、按摩、酒吧、咖啡廳」之類有實體位置的東西,就用 search_places。
這個工具會回真實 Google Maps 資料,系統會自動再幫你出卡片(照片+評分+地圖按鈕),
所以你的文字回覆不用列出地址跟連結 — 講一兩句推薦理由就好,卡片會接著出現。
範例觸發:「曼谷有什麼好吃的 pad thai?」「清邁推薦按摩店」「Phuket 看夕陽哪裡好?」
如果使用者問的不是具體店家(例:「泰國怎麼簽證」「BTS 怎麼搭」),就不要叫這個工具。

【你可以看圖片】
使用者傳了圖片,圖會直接出現在你的視野裡。常見場景:
- 菜單照 → 幫他翻譯 + 推薦哪幾道必點、雷區避開
- 景點/廟宇/街景照 → 認是哪裡、相關故事、附近建議
- 收據/帳單 → 換算成台幣、檢查是否被坑、教他下次怎麼避免
- 簽證表 / 行程截圖 / 訂房畫面 → 看內容回答問題
- 機票 / 火車票 → 提醒注意事項
看到圖直接做事,不用反問「你想知道什麼」(除非圖太模糊或看不出意圖)。

【你有群組記憶能力 (remember_fact)】
你可以記住關於這個群組或成員的事實,以後對話會自動帶進來。
什麼時候記:
- 使用者明確指令:「記住我吃素」「@bot 記得阿哲怕辣」→ 直接記
- 對話中自然出現的個人偏好/限制/背景:「我老婆懷孕」「我們預算 5 萬」「我有膝蓋舊傷」→ 主動記下來
- 旅行決定:「我們決定 12 月去清邁 7 天」→ 記
什麼時候不記:
- 一次性問題(「現在幾點」「天氣如何」)
- 已經記過的事
- 太瑣碎的(「我剛吃飽」)
記完後簡短回應「OK 記下來了」之類的就好,不要把記下的東西整段複述。

【你有記帳能力 (record_expense / query_expenses / delete_expense / compute_debts)】
群組是「跟朋友旅遊記帳」的場景。
- 使用者明確要記帳(「@bot 我午餐花了 200」)或要分帳(「我請大家喝 800」)→ 用 record_expense
- 使用者問結算 / 算錢 / 誰欠誰 / 誰花最多 → 先用 query_expenses 取資料,需要算誰欠誰時用 compute_debts
- 使用者要刪某筆(「剛才那筆刪掉」「取消上一筆」)→ 用 query_expenses 找到 → delete_expense
- 使用者問「今天花了多少」「這趟總共多少」就直接幫他列 + 加總
時間範圍解讀:
- 「今天」:從當地時間 00:00 開始
- 「這趟」「整趟」:預設過去 6 天(我們的 TTL),除非另有說明
- 「昨天」「上週」:推算 ISO 時間
回覆風格:列出來時用「①②③」加 emoji,不要 markdown。`;

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
