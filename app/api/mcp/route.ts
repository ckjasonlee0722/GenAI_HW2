// app/api/mcp/route.ts
// 自製的 HTTP-based MCP server，部署在 Vercel 也能跑
//
// 為什麼要自己寫：
//   官方的 filesystem MCP server 是 stdio-based，Vercel 的 serverless function
//   不能維持長連線 process，所以用 HTTP/SSE transport 重新 expose 幾個 tool。
//
// Exposed tools:
//   - list_my_memories   : 列出當前 user 的所有 long-term memories
//   - search_messages    : 在當前 user 的 messages 裡做關鍵字搜尋
//   - get_routing_stats  : 回傳 user 最近 50 次的 routing 決策統計
//
// 這些 tool 會被 chat route 當成 MCP tools merge 進 toolset，
// 模型實際呼叫時會打到這個 endpoint —— 對 demo 來說是「真的 MCP」。

import { createSupabaseServer } from '@/lib/supabase-server';

// MCP JSON-RPC 簡化實作（只支援必要的 method）
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

const TOOLS = [
  {
    name: 'list_my_memories',
    description: 'List all long-term memories stored about the current user.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['personal', 'preference', 'context', 'general'],
        },
      },
    },
  },
  {
    name: 'search_messages',
    description:
      'Search the current user\'s past messages by keyword. Returns top 10 matches.',
    inputSchema: {
      type: 'object',
      properties: { keyword: { type: 'string' } },
      required: ['keyword'],
    },
  },
  {
    name: 'get_routing_stats',
    description:
      "Get a histogram of which models were used for the user's last 50 messages.",
    inputSchema: { type: 'object', properties: {} },
  },
];

async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  if (name === 'list_my_memories') {
    let q = supabase
      .from('memories')
      .select('key, value, category, updated_at')
      .eq('user_id', user.id);
    if (args.category)
      q = q.eq('category', args.category as string);
    const { data } = await q.order('updated_at', { ascending: false });
    return {
      content: [{ type: 'text', text: JSON.stringify(data ?? [], null, 2) }],
    };
  }

  if (name === 'search_messages') {
    const kw = String(args.keyword ?? '');
    const { data } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .eq('user_id', user.id)
      .ilike('content', `%${kw}%`)
      .order('created_at', { ascending: false })
      .limit(10);
    return {
      content: [{ type: 'text', text: JSON.stringify(data ?? [], null, 2) }],
    };
  }

  if (name === 'get_routing_stats') {
    const { data } = await supabase
      .from('routing_logs')
      .select('chosen_model')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    const counts: Record<string, number> = {};
    (data ?? []).forEach((r) => {
      counts[r.chosen_model] = (counts[r.chosen_model] ?? 0) + 1;
    });
    return {
      content: [{ type: 'text', text: JSON.stringify(counts, null, 2) }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

export async function POST(req: Request) {
  const body = (await req.json()) as JsonRpcRequest;
  const { id, method, params } = body;

  try {
    if (method === 'initialize') {
      return Response.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'genai-hw2-mcp', version: '1.0.0' },
        },
      });
    }
    if (method === 'tools/list') {
      return Response.json({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      });
    }
    if (method === 'tools/call') {
      const { name, arguments: args } = params as {
        name: string;
        arguments: Record<string, unknown>;
      };
      const result = await handleToolCall(name, args ?? {});
      return Response.json({ jsonrpc: '2.0', id, result });
    }
    return Response.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Method not found: ${method}` },
    });
  } catch (e) {
    return Response.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32000, message: String(e) },
    });
  }
}

// SSE transport: GET = open stream, POST = send messages
// AI SDK 的 SSE client 會先 GET 取得 endpoint，再 POST tool calls
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(`event: endpoint\ndata: /api/mcp\n\n`),
      );
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
