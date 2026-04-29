// lib/memory.ts
// 每輪對話都跑一次 extraction
// 抽出 fact list 並 upsert 到 memories table

import { generateText } from 'ai';
import { z } from 'zod';
import { getModel } from './models';
import type { SupabaseClient } from '@supabase/supabase-js';

const RAW_CATEGORIES = ['personal', 'preference', 'context', 'general'] as const;
type Category = typeof RAW_CATEGORIES[number];

function normalizeCategory(raw: unknown): Category {
  const s = String(raw ?? '').toLowerCase().trim();
  if (s === 'personal' || s === 'identity' || s === 'profile') return 'personal';
  if (s === 'preference' || s === 'preferences' || s === 'taste' || s === 'favorite')
    return 'preference';
  if (
    s === 'context' ||
    s === 'project' ||
    s === 'research' ||
    s === 'work' ||
    s === 'education' ||
    s === 'school' ||
    s === 'current'
  )
    return 'context';
  return 'general';
}

const FactsSchema = z.object({
  facts: z
    .array(
      z.object({
        key: z.string().min(1).max(60),
        value: z.string().min(1).max(500),
        category: z.string().transform(normalizeCategory),
      }),
    )
    .max(8),
});

const SYSTEM = `Extract durable facts about the USER from a chat turn. The user message may be in any language (English, Chinese, etc.) — extract facts in their original wording when natural.

Examples of facts to extract:
- name, age, location, school, job, major
- preferences (favorite language / framework / food / style)
- ongoing projects or research topics
- skills, expertise level

DO extract:
- "我叫 Jason" → {key: "user_name", value: "Jason", category: "personal"}
- "我是 NYCU CS 三年級" → multiple facts: school, major, year
- "I love Rust" → {key: "favorite_language", value: "Rust", category: "preference"}
- "I'm working on transistor placement" → {key: "current_project", value: "...", category: "context"}

DO NOT extract:
- one-shot questions ("what's 2+2")
- emotions or mood
- the assistant's own statements

Always return JSON. Keys: snake_case English. Values: original wording. If nothing fits, return {"facts": []}.`;

export async function extractFacts(
  userMessage: string,
  assistantReply: string,
): Promise<Array<{ key: string; value: string; category: string }>> {
  try {
    const { text } = await generateText({
      model: getModel('fast'),
      system:
        SYSTEM +
        '\n\nIMPORTANT: Respond with ONLY a JSON object in the form {"facts":[...]}. No markdown, no preamble, no explanation. Just the JSON.',
      prompt: `USER said: "${userMessage.slice(0, 1500)}"

ASSISTANT replied: "${assistantReply.slice(0, 400)}"

Extract durable facts about the USER. Be generous — if they mention their name, school, year, project, preferences, or anything biographical, extract it.

Respond with ONLY a JSON object: {"facts": [{"key": "...", "value": "...", "category": "..."}, ...]}`,
    });

    // Strip markdown code fences
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    // Find first { and last } to be robust against preamble/postamble
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) {
      console.warn('[extractFacts] no JSON found in:', cleaned.slice(0, 200));
      return [];
    }
    const jsonStr = cleaned.slice(start, end + 1);

    const parsed = JSON.parse(jsonStr);
    const validated = FactsSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn('[extractFacts] schema validation failed:', validated.error);
      return [];
    }
    return validated.data.facts;
  } catch (e) {
    console.error('[extractFacts] error:', e);
    return [];
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