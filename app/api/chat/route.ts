// app/api/chat/route.ts
// Main chat endpoint — 把 v2 所有功能串起來：
//   1. 讀 user 的 long-term memories → 注入 system prompt
//   2. router.routeQuery() 決定 model
//   3. 組 tools = 內建 tools + MCP tools
//   4. streamText 串回前端
//   5. onFinish: 抽 facts、寫 routing log、存 message 到 DB

import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getModel, MODELS } from '@/lib/models';
import { routeQuery } from '@/lib/router';
import { extractFacts, upsertMemories, formatMemoriesForPrompt } from '@/lib/memory';
import {
  webSearchTool,
  buildRecallMemoryTool,
  calculatorTool,
} from '@/lib/tools';
import { getMCPClient } from '@/lib/mcp';

export const maxDuration = 30;

const BASE_SYSTEM = `You are a helpful assistant powered by Llama models on Groq.
Be concise. Use tools when they would give a more accurate answer.
When you remember something about the user, mention it naturally — don't list memories.`;

export async function POST(req: Request) {
  const body = await req.json();
  const { messages, conversationId, parentId, branchId } = body;

  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  // ---------------- 1. Load memories -----------------
  const { data: mems } = await supabase
    .from('memories')
    .select('key, value, category')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(40);
  const memoryBlock = formatMemoriesForPrompt(mems ?? []);

  // ---------------- 2. Routing -----------------
  const lastMsg = messages[messages.length - 1];
  const userText =
    typeof lastMsg.content === 'string'
      ? lastMsg.content
      : (lastMsg.parts ?? lastMsg.content ?? [])
          .filter((p: { type: string }) => p.type === 'text')
          .map((p: { text: string }) => p.text)
          .join(' ');
  const hasImage = JSON.stringify(lastMsg).includes('"type":"image"');

  const decision = await routeQuery(userText, hasImage);
  const modelSpec = MODELS[decision.model];

  // ---------------- 3. Tools (built-in + MCP) -----------------
  const builtInTools = {
    web_search: webSearchTool,
    recall_memory: buildRecallMemoryTool(supabase, user.id),
    calculate: calculatorTool,
  };

  let mcpTools = {};
  let mcpClient: Awaited<ReturnType<typeof getMCPClient>> = null;
  try {
    mcpClient = await getMCPClient();
    if (mcpClient) mcpTools = await mcpClient.tools();
  } catch (e) {
    console.warn('[chat] MCP unavailable:', e);
  }

  const allTools = { ...builtInTools, ...mcpTools };

  // ---------------- 4. Stream -----------------
  const result = streamText({
    model: getModel(decision.model),
    system: BASE_SYSTEM + memoryBlock,
    messages: convertToModelMessages(messages),
    tools: allTools,
    stopWhen: stepCountIs(5),

    // 把 routing 決策當 metadata 送回前端 → UI badge 顯示
    experimental_telemetry: { isEnabled: false },

    onFinish: async ({ text, finishReason }) => {
      try {
        // 4a. persist assistant message
        const { data: assistantRow } = await supabase
          .from('messages')
          .insert({
            user_id: user.id,
            conversation_id: conversationId,
            role: 'assistant',
            content: text,
            parent_id: parentId ?? null,
            branch_id: branchId ?? conversationId,
            model: modelSpec.id,
          })
          .select('id')
          .single();

        // 4b. routing log
        await supabase.from('routing_logs').insert({
          user_id: user.id,
          message_id: assistantRow?.id,
          chosen_model: modelSpec.id,
          reason: decision.reason,
          has_image: hasImage,
          has_tools: finishReason === 'tool-calls',
        });

        // 4c. extract & upsert memories（每輪都跑）
        if (userText.length > 10) {
          const facts = await extractFacts(userText, text);
          await upsertMemories(supabase, user.id, facts, assistantRow?.id);
        }
      } catch (e) {
        console.error('[chat onFinish] error:', e);
      } finally {
        if (mcpClient) await mcpClient.close().catch(() => {});
      }
    },
  });

  // 把 routing 決策放在 response header → 前端讀來顯示 badge
  return result.toUIMessageStreamResponse({
    headers: {
      'X-Routed-Model': modelSpec.id,
      'X-Routed-Label': encodeURIComponent(modelSpec.label),
      'X-Routed-Reason': encodeURIComponent(decision.reason),
      'X-Routed-Method': decision.method,
    },
  });
}
