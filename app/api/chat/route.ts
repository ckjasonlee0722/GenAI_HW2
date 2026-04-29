// app/api/chat/route.ts
// Main chat endpoint — bypass convertToModelMessages 自己組 Groq plain format

import { streamText, stepCountIs, type ModelMessage } from 'ai';
import { createSupabaseServer } from '@/lib/supabase-server';
import { getModel, MODELS } from '@/lib/models';
import { routeQuery } from '@/lib/router';
import { extractFacts, formatMemoriesForPrompt } from '@/lib/memory';
import {
  webSearchTool,
  buildRecallMemoryTool,
  calculatorTool,
} from '@/lib/tools';

export const maxDuration = 30;

const BASE_SYSTEM = `You are a helpful assistant powered by Llama models on Groq.
Be concise.

You have access to these tools — when relevant, INVOKE them via the function-calling API. Do NOT write tool calls as plain text or XML tags.
- calculate: for arithmetic
- web_search: for current events / unknowns
- recall_memory: to look up what you remember about the user

When you use long-term memory about the user, mention facts naturally without listing them.`;

interface UIPart {
  type: string;
  text?: string;
  url?: string;
  mediaType?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
}

interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string;
  parts?: UIPart[];
}

type UserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string };

function buildUserContent(parts: UIPart[]): UserContentPart[] {
  const result: UserContentPart[] = [];
  for (const p of parts) {
    if (p.type === 'text' && p.text) {
      result.push({ type: 'text', text: p.text });
    } else if ((p.type === 'file' || p.type === 'image') && p.url) {
      result.push({ type: 'image', image: p.url });
    }
  }
  return result;
}

function uiToGroqMessages(uiMsgs: UIMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];

  for (const m of uiMsgs) {
    const parts: UIPart[] =
      m.parts ??
      (typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : []);

    if (m.role === 'user') {
      const hasMedia = parts.some(
        (p) => p.type === 'file' || p.type === 'image' || p.type === 'image_url',
      );
      if (hasMedia) {
        const arr = buildUserContent(parts);
        out.push({ role: 'user', content: arr } as unknown as ModelMessage);
      } else {
        const text = parts
          .filter((p) => p.type === 'text')
          .map((p) => p.text ?? '')
          .join('');
        out.push({ role: 'user', content: text });
      }
      continue;
    }

    if (m.role === 'assistant') {
      // 只取 text part，所有 tool history 攤平成 inline 文字描述
      // 避免 Groq 對 multi-turn tool 結構挑剔
      const textParts = parts
        .filter((p) => p.type === 'text')
        .map((p) => p.text ?? '')
        .join('');

      const toolCallParts = parts.filter((p) => p.type?.startsWith('tool-'));
      const toolSummary = toolCallParts
        .map((p) => {
          const toolName = p.type!.replace('tool-', '');
          const outStr =
            p.output !== undefined
              ? typeof p.output === 'string'
                ? p.output
                : JSON.stringify(p.output)
              : '(no output)';
          return `[Used ${toolName}: ${outStr.slice(0, 200)}]`;
        })
        .join(' ');

      const finalText = [textParts, toolSummary].filter(Boolean).join('\n');

      out.push({
        role: 'assistant',
        content: finalText || '(empty)',
      });
      continue;
    }
  }
  return out;
}

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

  // ----- ensure conversation exists (upsert) -----
  await supabase
    .from('conversations')
    .upsert(
      { id: conversationId, user_id: user.id },
      { onConflict: 'id', ignoreDuplicates: true },
    );

  const { data: mems } = await supabase
    .from('memories')
    .select('key, value, category')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(40);
  const memoryBlock = formatMemoriesForPrompt(mems ?? []);

  const lastMsg = messages[messages.length - 1];
  const userText =
    typeof lastMsg.content === 'string'
      ? lastMsg.content
      : (lastMsg.parts ?? lastMsg.content ?? [])
          .filter((p: { type: string }) => p.type === 'text')
          .map((p: { text: string }) => p.text)
          .join(' ');
  const hasImage =
    JSON.stringify(lastMsg).includes('"type":"image"') ||
    JSON.stringify(lastMsg).includes('"type":"file"');

  const decision = await routeQuery(userText, hasImage);
  const modelSpec = MODELS[decision.model];

  const builtInTools = {
    web_search: webSearchTool,
    recall_memory: buildRecallMemoryTool(supabase, user.id),
    calculate: calculatorTool,
  };

  const modelMessages = uiToGroqMessages(messages);

  const result = streamText({
    model: getModel(decision.model),
    system: BASE_SYSTEM + memoryBlock,
    messages: modelMessages,
    tools: builtInTools,
    stopWhen: stepCountIs(5),

    experimental_telemetry: { isEnabled: false },

    onFinish: async ({ text, finishReason }) => {
      try {
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

        await supabase.from('routing_logs').insert({
          user_id: user.id,
          message_id: assistantRow?.id,
          chosen_model: modelSpec.id,
          reason: decision.reason,
          has_image: hasImage,
          has_tools: finishReason === 'tool-calls',
        });

        if (userText.length > 10) {
          const facts = await extractFacts(userText, text);
          if (facts.length > 0) {
            const upsertRows = facts.map((f) => ({
              user_id: user.id,
              key: f.key,
              value: f.value,
              category: f.category,
              source_msg: assistantRow?.id ?? null,
              updated_at: new Date().toISOString(),
            }));
            await supabase
              .from('memories')
              .upsert(upsertRows, { onConflict: 'user_id,key' });
          }
        }
      } catch (e) {
        console.error('[chat onFinish] error:', e);
      }
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      'X-Routed-Model': modelSpec.id,
      'X-Routed-Label': encodeURIComponent(modelSpec.label),
      'X-Routed-Reason': encodeURIComponent(decision.reason),
      'X-Routed-Method': decision.method,
    },
  });
}