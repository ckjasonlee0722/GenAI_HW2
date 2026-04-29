// lib/router.ts
// Auto routing: 用 8B 小模型分類 query，決定要交給哪個主模型
//
// Routing rules（hard-coded fast path 優先，省 token）:
//   1. Message 含 image     → vision
//   2. Message 很短且無 image → fast (skip LLM call)
//   3. 其他都丟 LLM 分類    → fast / reasoning
//
// LLM 只回 JSON: { "model": "fast" | "reasoning", "reason": "..." }

import { generateObject } from 'ai';
import { z } from 'zod';
import { getModel, ModelKey } from './models';

export interface RoutingDecision {
  model: ModelKey;
  reason: string;
  method: 'rule' | 'llm';     // 給 UI 顯示用
}

const RoutingSchema = z.object({
  model: z.enum(['fast', 'reasoning']),
  reason: z.string().max(120),
});

export async function routeQuery(
  text: string,
  hasImage: boolean,
): Promise<RoutingDecision> {
  // -------- Rule 1: 圖片 → vision --------
  if (hasImage) {
    return {
      model: 'vision',
      reason: 'Message contains an image — using multimodal model',
      method: 'rule',
    };
  }

  // -------- Rule 2: 短訊息 → fast --------
  const trimmed = text.trim();
  if (trimmed.length < 30 && !/[?？]/.test(trimmed)) {
    return {
      model: 'fast',
      reason: 'Short greeting / acknowledgement — using fast model',
      method: 'rule',
    };
  }

  // -------- Rule 3: LLM 分類 --------
  try {
    const { object } = await generateObject({
      model: getModel('router'),
      schema: RoutingSchema,
      system: `You are a routing classifier. Decide which model handles the user query.
- "fast"      : casual chat, simple factual lookup, short Q&A, single-turn confirmation
- "reasoning" : code, math, multi-step analysis, planning, anything needing tool use, long answers, technical research

Reply with JSON only: {"model": "...", "reason": "<=15 words"}`,
      prompt: trimmed.slice(0, 500),
    });
    return { ...object, method: 'llm' };
  } catch {
    // 萬一 router LLM 掛了，fallback to reasoning（保守）
    return {
      model: 'reasoning',
      reason: 'Router fallback — defaulting to reasoning model',
      method: 'rule',
    };
  }
}
