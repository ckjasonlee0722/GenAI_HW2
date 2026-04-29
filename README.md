# GenAI HW2 — v2

> A v2 upgrade of my HW1 ChatGPT-style app with **long-term memory**, **multimodal image input**, **automatic model routing**, **tool use**, **MCP endpoint support**, and extra product-style chat features such as **persistent chat history**, **conversation sidebar**, **branching**, **markdown rendering**, and **dark / light mode**.

- GitHub: https://github.com/ckjasonlee0722/GenAI_HW2
- Live demo: https://gen-ai-hw-2.vercel.app
- Base project: HW1 ChatGPT-style app with Supabase auth, streaming chat, and persistent conversations

---

## 1. Assignment requirement mapping

| Requirement | Implementation | Main files |
|---|---|---|
| Long-term memory | Extracts durable user facts after chat turns, stores them in Supabase, and injects them back into the system prompt on later requests. | `lib/memory.ts`, `app/api/memories/route.ts`, `app/components/MemoryDrawer.tsx`, `supabase/migrations/0001_v2_schema.sql` |
| Multimodal | Supports image upload from the chat composer. Image messages are routed to a vision-capable model. | `app/page.tsx`, `lib/models.ts`, `lib/router.ts` |
| Auto routing between models | Uses hard rules first, then an 8B classifier for ambiguous prompts. The selected model is shown in the UI routing badge. | `lib/router.ts`, `lib/models.ts`, `app/api/chat/route.ts` |
| Tool use | Exposes built-in AI SDK tools for web search, memory recall, and arithmetic calculation. Tool calls are displayed in the chat UI. | `lib/tools.ts`, `app/api/chat/route.ts`, `app/page.tsx` |
| MCP | Implements a deployable JSON-RPC/SSE-style MCP endpoint with tools for memory listing, message search, and routing statistics. | `app/api/mcp/route.ts`, `lib/mcp.ts` |
| Other useful functions | Adds persistent chat history, conversation sidebar, conversation branching, markdown/code rendering, magic-link login, and theme toggle. | `app/page.tsx`, `app/components/*`, `app/api/conversations/route.ts`, `app/api/branch/route.ts`, `app/api/messages/route.ts` |

---

## 2. Feature overview

### Long-term memory

The assistant extracts durable facts from each meaningful conversation turn. These facts are stored as key-value memories in Supabase:

```txt
memories(user_id, key, value, category, source_msg, created_at, updated_at)
unique(user_id, key)
```

On later requests, the latest memories are loaded and injected into the system prompt, allowing the assistant to remember stable user information across sessions and devices.

The user can also open the **Memory Drawer** to inspect and delete stored memories.

---

### Multimodal image input

Users can attach images from the composer. The frontend converts the selected file into a data URL and sends it as a file part. The router detects image/file content and routes the request to the vision model:

```txt
image input → Llama 4 Scout
```

This demonstrates multimodal capability while keeping the same chat interface.

---

### Automatic model routing

The system does not require the user to manually choose a model. Instead, it chooses the best model per request.

Routing logic:

| Condition | Selected model | Method |
|---|---|---|
| Message contains image | `meta-llama/llama-4-scout-17b-16e-instruct` | Rule |
| Very short non-question message | `llama-3.1-8b-instant` | Rule |
| Code, math, planning, multi-step reasoning, or complex query | `llama-3.3-70b-versatile` | 8B classifier |
| Router failure fallback | `llama-3.3-70b-versatile` | Safe fallback |

The response header returns the routing decision, and the frontend displays it as a live badge:

```txt
routed → Llama 3.3 70B
```

---

### Tool use

The app exposes three built-in tools through AI SDK tool calling:

| Tool | Purpose |
|---|---|
| `web_search` | Searches up-to-date information using DuckDuckGo Instant Answer API |
| `recall_memory` | Queries Supabase memories for personalization |
| `calculate` | Evaluates simple arithmetic expressions safely |

Tool calls are rendered as expandable rows in the chat interface, so the demo can clearly show when the model used a tool instead of only generating plain text.

---

### MCP endpoint

The project includes a custom MCP-style endpoint at:

```txt
/api/mcp
```

It supports JSON-RPC methods:

```txt
initialize
tools/list
tools/call
```

Exposed MCP tools:

| MCP tool | Description |
|---|---|
| `list_my_memories` | Lists the current user's long-term memories |
| `search_messages` | Searches previous messages by keyword |
| `get_routing_stats` | Returns a histogram of recently selected models |

Implementation note: the cloud-safe MCP server endpoint is implemented in `app/api/mcp/route.ts`. The experimental automatic MCP client adapter in `lib/mcp.ts` is intentionally disabled in this build because the AI SDK v6 MCP client package is separated; the endpoint itself remains available and testable through JSON-RPC/SSE.

Example MCP test:

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

### Persistent chat history and conversation sidebar

The app stores conversations and messages in Supabase. After login, users can see recent conversations in the left sidebar, open older conversations, and start a new conversation.

This preserves the important HW1 behavior:

- chat history persists after refresh
- history follows the user after login on another device
- conversations can be selected from the sidebar

---

### Conversation branching

Users can fork from a previous user message and explore an alternative path. The app creates a new `branch_id` and loads the corresponding branch history.

This turns a linear chatbot into a non-linear exploration interface:

```txt
conversation
├── main branch
├── fork 1
└── fork 2
```

---

### Markdown rendering, code blocks, and theme toggle

Assistant responses are rendered with `react-markdown` and `remark-gfm`, so the assistant can return formatted explanations, tables, lists, and code blocks.

The UI also supports persistent dark/light mode using `localStorage`.

---

## 3. System architecture

```txt
                        GenAI HW2 — v2 Architecture

        ┌─────────────────────────────────────────────────────┐
        │                  Browser / React UI                 │
        │                                                     │
        │  Chat UI · Image Upload · Markdown Renderer         │
        │  Memory Drawer · Conversation Sidebar               │
        │  Branch Sidebar · Theme Toggle · Routing Badge      │
        └───────────────┬─────────────────────┬───────────────┘
                        │                     │
                        │ POST /api/chat      │ REST API calls
                        │                     │
                        ▼                     ▼
        ┌─────────────────────────────────────────────────────┐
        │              Next.js Route Handlers                 │
        │                                                     │
        │  /api/chat                                          │
        │    1. authenticate user with Supabase               │
        │    2. ensure conversation exists                    │
        │    3. load long-term memories                       │
        │    4. routeQuery() chooses model                    │
        │    5. attach built-in tools                         │
        │    6. streamText() with Groq                        │
        │    7. onFinish: persist assistant message           │
        │    8. log routing decision                          │
        │    9. extractFacts() and upsert memories            │
        │                                                     │
        │  /api/conversations   list user conversations       │
        │  /api/messages        load branch messages          │
        │  /api/memories        inspect/delete memories       │
        │  /api/branch          create/list branches          │
        │  /api/mcp             JSON-RPC MCP endpoint         │
        └───────────────┬─────────────────────┬───────────────┘
                        │                     │
                        ▼                     ▼
        ┌───────────────────────┐   ┌─────────────────────────┐
        │        Groq API        │   │     Supabase Postgres    │
        │                       │   │                         │
        │  Llama 3.1 8B         │   │  auth.users              │
        │  Llama 3.3 70B        │   │  conversations           │
        │  Llama 4 Scout        │   │  messages                │
        │                       │   │  memories                │
        │                       │   │  routing_logs            │
        └───────────────────────┘   └─────────────────────────┘
```

---

## 4. Current file structure

```txt
GenAI_HW2/
├── app/
│   ├── api/
│   │   ├── branch/route.ts
│   │   ├── chat/route.ts
│   │   ├── conversations/route.ts
│   │   ├── mcp/route.ts
│   │   ├── memories/route.ts
│   │   └── messages/route.ts
│   ├── auth/callback/
│   ├── components/
│   │   ├── BranchSidebar.tsx
│   │   ├── ConversationSidebar.tsx
│   │   └── MemoryDrawer.tsx
│   ├── login/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── mcp.ts
│   ├── memory.ts
│   ├── models.ts
│   ├── router.ts
│   ├── supabase-browser.ts
│   ├── supabase-server.ts
│   └── tools.ts
├── supabase/
│   └── migrations/
│       └── 0001_v2_schema.sql
├── package.json
├── next.config.mjs
├── postcss.config.mjs
└── tsconfig.json
```

---

## 5. Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 |
| UI | React 19, Tailwind CSS v4, lucide-react |
| AI SDK | Vercel AI SDK v5/v6-style APIs, `streamText`, `useChat` |
| Models | Groq-hosted Llama models |
| Auth | Supabase magic-link login |
| Database | Supabase Postgres + Row Level Security |
| Rendering | `react-markdown`, `remark-gfm` |
| Deployment | Vercel |

---

## 6. Run locally

```bash
git clone https://github.com/ckjasonlee0722/GenAI_HW2.git
cd GenAI_HW2

npm install
```

Create `.env.local`:

```env
GROQ_API_KEY=your_groq_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Run the Supabase migration:

```txt
supabase/migrations/0001_v2_schema.sql
```

Then start the development server:

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

---

## 7. Demo script

Recommended 3–5 minute demo flow:

1. **Login**
   - Show magic-link authentication page.
   - Explain that user data is separated by Supabase Auth and RLS.

2. **Long-term memory**
   - Send: `Hi, I'm Jason. I study CS and I am working on GenAI HW2.`
   - Open the Memory Drawer.
   - Show extracted facts.

3. **Persistent chat history**
   - Refresh the page or start another conversation.
   - Show that old conversations are still available from the sidebar.

4. **Multimodal + routing**
   - Upload an image.
   - Ask: `What is in this image?`
   - Show routing badge: `routed → Llama 4 Scout`.

5. **Tool use**
   - Ask: `Calculate (65536 * 3.14).`
   - Expand the tool-call row.
   - Ask a current-information question to trigger `web_search`.

6. **Markdown/code rendering**
   - Ask: `Show me a Python hello world example in markdown.`
   - Show the rendered code block.

7. **Branching**
   - Click `branch from here` on a user message.
   - Continue the conversation in a fork.
   - Switch branches from the sidebar.

8. **MCP endpoint**
   - Show `/api/mcp` or run the `tools/list` JSON-RPC example.
   - Explain that the app exposes memory, message search, and routing statistics as MCP tools.

9. **Theme toggle**
   - Switch between dark and light mode.

---

## 8. What changed from HW1

| Area | HW1 | HW2 v2 |
|---|---|---|
| Memory | Short-term conversation context | Long-term memory stored in Supabase |
| Input | Text chat | Text + image upload |
| Model choice | Manual or single-model style | Automatic routing between fast, reasoning, and vision models |
| Tools | Basic chat only | Web search, memory recall, calculator |
| MCP | Not included | `/api/mcp` JSON-RPC/SSE endpoint |
| Chat history | Persistent chat history | Persistent history + conversation sidebar |
| Conversation flow | Linear | Branchable conversations |
| Rendering | Basic output | Markdown + GFM rendering |
| UI | Dark style | Dark/light theme toggle |

---

## 9. Known limitations and future work

- The automatic MCP client adapter is disabled in the current build; the MCP server endpoint is implemented and testable, but MCP tools are not automatically merged into `/api/chat`.
- Long-term memory extraction currently runs frequently. A future version could batch extraction every few turns to reduce cost.
- Branch visualization is sidebar-based; a future version could use a graph view such as React Flow.
- Uploaded files other than images are not processed yet.
- The web search tool uses DuckDuckGo Instant Answer, which is lightweight but not a full search/RAG pipeline.

---

## 10. License

MIT — homework / educational use.
