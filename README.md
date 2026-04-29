# GenAI HW2 — `v2`

> Upgrade of [HW1 ChatGPT-style app](https://github.com/ckjasonlee0722/GenAI_HW1) with **long-term memory · multimodal · auto-routing · tool use & MCP · conversation branching**.

Built on the same stack as v1 (Next.js 16 · Tailwind v4 · Vercel AI SDK · Groq · Supabase) so the upgrade is purely additive — no rewrite of the auth / chat plumbing.

---

## 一、Feature map（給助教看的對應表）

| 作業要求 | v2 實作位置 | 一句話說明 |
|---|---|---|
| **1. Long-term memory** | `lib/memory.ts` + `supabase/migrations/0001_v2_schema.sql` (`memories` table) | 每輪對話用 8B 模型抽 fact，upsert 到 `memories` table，下輪自動注入 system prompt |
| **2. Multimodal** | `app/page.tsx` (image upload) + `lib/models.ts` (`vision` slot = Llama 4 Scout) | 上傳圖片時 router 強制路由到 vision 模型 |
| **3. Auto routing** | `lib/router.ts` | 規則 + 8B classifier 雙層決策；UI 即時顯示 `routed → <model>` badge |
| **4. Tool use** | `lib/tools.ts` | 三個 built-in tool: `web_search`, `recall_memory`, `calculate` |
| **4. MCP** | `lib/mcp.ts` + `app/api/mcp/route.ts` | 本地用 stdio 接 filesystem MCP；雲端用自寫的 HTTP/SSE MCP server |
| **5. 加分功能** | `app/api/branch/route.ts` + branching UI | 從任何 user message 分叉新 branch，sidebar 顯示 tree |

---

## 二、Architecture

```
              ┌─────────────────────────────────────────┐
  user input  │  /api/chat                              │
  ──────────▶ │                                         │
              │  1. load memories  (Supabase)           │
              │  2. routeQuery()  ───▶ pick model       │
              │  3. merge tools = builtIn + MCP         │
              │  4. streamText (with tools)             │
              │  5. onFinish:                           │
              │       • persist message + branch_id     │
              │       • routing_logs.insert             │
              │       • extractFacts → upsert memories  │
              └──────────────┬──────────────────────────┘
                             │ stream
                             ▼
              ┌─────────────────────────┐
              │  React UI (page.tsx)    │
              │  • routing badge        │
              │  • tool call viewer     │
              │  • branch sidebar       │
              │  • memory drawer        │
              └─────────────────────────┘
```

### Routing decision table

| 條件 | Model | 理由 |
|---|---|---|
| message 含 image | `llama-4-scout-17b-16e-instruct` | rule (vision) |
| `len < 30` 且非問句 | `llama-3.1-8b-instant` | rule (fast) |
| 其他 | LLM classifier (8B) → `fast` 或 `llama-3.3-70b-versatile` | reasoning if code/math/multi-step |

兩個 fast-path 規則先擋掉 80% 的 query，剩下才花一次 8B classifier 呼叫。

### Memory model

```
memories(user_id, key, value, category, source_msg, updated_at)
       └── unique(user_id, key)   ← upsert: 同 key 用新值覆蓋
```

Trigger：**每輪對話**都跑 `extractFacts()`。Prompt 設計過濾掉一次性問題、情緒、AI 自己的話 — 只留「明天還會是真的」的 fact。

---

## 三、Run locally

```bash
git clone https://github.com/ckjasonlee0722/GenAI_HW2
cd GenAI_HW2
pnpm install              # or npm / yarn

cp .env.example .env.local
# 填入 GROQ_API_KEY / SUPABASE keys

# 跑 v2 migration（在 Supabase SQL editor 貼上）
cat supabase/migrations/0001_v2_schema.sql

# 開發模式（含 stdio MCP）
MCP_MODE=stdio pnpm dev
```

開 [http://localhost:3000](http://localhost:3000) 即可。

### MCP demo（本地 stdio）

設定 `MCP_MODE=stdio` 後，模型會自動取得 `@modelcontextprotocol/server-filesystem` 的 tools（讀檔、列目錄、寫檔）。在 chat 中試：
- 「What files are in the sandbox folder?」
- 「Read the contents of `notes.md`」

### MCP demo（雲端 HTTP）

部署到 Vercel 時 `MCP_MODE` 留白，會自動連到同 app 的 `/api/mcp` endpoint，提供：
- `list_my_memories` — 列出當前 user 的長期記憶
- `search_messages` — 關鍵字搜尋過往對話
- `get_routing_stats` — 最近 50 次的 routing 直方圖

雙模式設計示範了 MCP 的 stdio 跟 SSE 兩種 transport。

---

## 四、Demo script（建議錄影流程）

1. 第一次說「Hi, I'm Jason, I study CS at NYCU.」→ 開 Memory drawer，看到 `user_name=Jason`, `school=NYCU` 已被記住
2. 上傳一張圖片問「What's in this picture?」→ header badge 顯示 `routed → Llama 4 Scout`
3. 問「What's 2^16 * 3.14?」→ 觸發 `calculate` tool，UI 展開 tool call detail
4. 問「Search the web for latest AI news」→ 觸發 `web_search` tool
5. 問「Use the MCP server to list my memories」→ 觸發 `list_my_memories` (MCP)
6. 在某條 user message 按「branch from here」→ sidebar 出現新 branch
7. 重新整理頁面，再問「Do you remember my name?」→ 模型用記憶回答（驗證 long-term memory persistence）

---

## 五、What changed from v1

| 檔案 | v1 | v2 |
|---|---|---|
| `app/api/chat/route.ts` | 直接呼叫 Groq | 加入 routing / tools / MCP / memory injection / onFinish persistence |
| `lib/models.ts` | （新增）| 集中化 model registry |
| `lib/router.ts` | （新增）| auto-routing |
| `lib/memory.ts` | （新增）| fact extraction + upsert |
| `lib/tools.ts` | （新增）| 內建 tool 定義 |
| `lib/mcp.ts`, `app/api/mcp/route.ts` | （新增）| MCP 整合 |
| `app/api/branch/route.ts` | （新增）| 分叉邏輯 |
| `app/components/MemoryDrawer.tsx`, `BranchSidebar.tsx` | （新增）| 新 UI |
| schema | `messages`, `conversations` | + `memories`, `routing_logs`, `messages.parent_id`, `messages.branch_id` |

---

## 六、Known limitations / future work

- Memory extraction 每輪都跑 → 成本是 v1 的 ~2×（多一次 8B 呼叫）。可改成每 N 輪 batch
- 目前 MCP HTTP server 只 expose 三個 tool，可擴充更多
- Branching tree 在 sidebar 是平的，沒做 graph 視覺化（未來可加 React Flow）
- 沒做 RAG over uploaded documents — 圖片以外的檔案目前不處理

---

## License

MIT (作業用途)
