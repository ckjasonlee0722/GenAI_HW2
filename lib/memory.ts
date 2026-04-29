// lib/memory.ts
// 每輪對話都跑一次 extraction（per user 設定）
// 抽出 fact list 並 upsert 到 memories table
//
// 注意：trigger=每輪，所以用最快的 8B 模型，prompt 設計要 fail-safe
// （回不出 JSON 就直接吃掉，不影響主對話）

import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel } from './models';
import type { SupabaseClient } from '@supabase/supabase-js';

const FactsSchema = z.object({
  facts: z
    .array(
      z.object({
        key: z.string().min(1).max(60),
        value: z.string().min(1).max(500),
        category: z
          .enum(['personal', 'preference', 'context', 'general'])
          .default('general'),
      }),
    )
    .max(8),
});

const SYSTEM = `You extract durable facts about the user from a chat turn.

A "fact" is something that will still be true tomorrow:
- personal info (name, location, role, school)
- preferences (favorite language, coding style, dietary restriction)
- ongoing context (current project, today's goal)

Return JSON only. If nothing is worth remembering, return {"facts": []}.

Keys must be snake_case, stable across turns. Examples:
- "user_name", "current_project", "favorite_framework", "graduation_year"

Do NOT extract:
- one-shot questions ("what's 2+2")
- AI's own statements
- emotions or transient mood`;

export async function extractFacts(
  userMessage: string,
  assistantReply: string,
): Promise<Array<{ key: string; value: string; category: string }>> {
  try {
    const { object } = await generateObject({
      model: getModel('fast'),
      schema: FactsSchema,
      system: SYSTEM,
      prompt: `USER: ${userMessage.slice(0, 1500)}
ASSISTANT: ${assistantReply.slice(0, 800)}

Extract durable facts about the USER only.`,
    });
    return object.facts;
  } catch {
    return [];     // fail silently — 不要打斷主流程
  }
}

export async function upsertMemories(
  supabase: SupabaseClient,
  userId: string,
  facts: Array<{ key: string; value: string; category: string }>,
  sourceMsgId?: string,
) {
  if (facts.length === 0) return;
  const rows = facts.map((f) => ({
    user_id: userId,
    key: f.key,
    value: f.value,
    category: f.category,
    source_msg: sourceMsgId ?? null,
    updated_at: new Date().toISOString(),
  }));
  await supabase
    .from('memories')
    .upsert(rows, { onConflict: 'user_id,key' });
}

// Build the memory injection block for system prompt
export function formatMemoriesForPrompt(
  memories: Array<{ key: string; value: string; category: string }>,
): string {
  if (memories.length === 0) return '';

  const grouped: Record<string, string[]> = {};
  for (const m of memories) {
    (grouped[m.category] ??= []).push(`- ${m.key}: ${m.value}`);
  }

  const sections = Object.entries(grouped)
    .map(([cat, items]) => `[${cat}]\n${items.join('\n')}`)
    .join('\n\n');

  return `\n\n=== Long-term memory about this user ===\n${sections}\n=== End memory ===\n`;
}
