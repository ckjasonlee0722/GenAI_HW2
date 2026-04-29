// lib/tools.ts
// AI SDK tool definitions. 模型自己決定要不要呼叫。
// 我們做三個 tool：
//   1. web_search          — 用免費的 DuckDuckGo Instant Answer API（不用 key）
//   2. recall_memory       — 主動查 user 的長期記憶
//   3. calculate           — 安全的數學計算
// MCP tools 由 chat route 額外從 MCP client 取得後 merge 進來。

import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------- 1. Web search ----------
export const webSearchTool = tool({
  description:
    'Search the web for up-to-date information. Use this for current events, recent news, or facts that may have changed.',
  inputSchema: z.object({
    query: z.string().describe('The search query, 1–6 keywords'),
  }),
  execute: async ({ query }) => {
    try {
      const res = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`,
      );
      const data = await res.json();
      return {
        abstract: data.AbstractText || '(no abstract)',
        source: data.AbstractURL || '',
        related: (data.RelatedTopics || [])
          .slice(0, 3)
          .map((t: { Text?: string }) => t.Text)
          .filter(Boolean),
      };
    } catch (e) {
      return { error: 'search failed', detail: String(e) };
    }
  },
});

// ---------- 2. Recall memory ----------
export function buildRecallMemoryTool(
  supabase: SupabaseClient,
  userId: string,
) {
  return tool({
    description:
      "Look up what you remember about the user (their name, preferences, current projects, etc). Use when the user asks 'do you remember X' or when personalization would help.",
    inputSchema: z.object({
      key_pattern: z
        .string()
        .optional()
        .describe('Optional substring to filter memory keys'),
    }),
    execute: async ({ key_pattern }) => {
      let q = supabase
        .from('memories')
        .select('key, value, category')
        .eq('user_id', userId);
      if (key_pattern) q = q.ilike('key', `%${key_pattern}%`);
      const { data, error } = await q.limit(20);
      if (error) return { error: error.message };
      return { memories: data ?? [] };
    },
  });
}

// ---------- 3. Calculator ----------
export const calculatorTool = tool({
  description:
    'Evaluate a simple arithmetic expression. Supports + - * / ( ) and decimals.',
  inputSchema: z.object({
    expression: z.string().describe('e.g. "(12 + 5) * 3.14"'),
  }),
  execute: async ({ expression }) => {
    // 嚴格白名單：只允許數字、運算子、小數點、空白、括號
    if (!/^[\d+\-*/(). \s]+$/.test(expression)) {
      return { error: 'expression contains illegal characters' };
    }
    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${expression});`)();
      return { result };
    } catch (e) {
      return { error: String(e) };
    }
  },
});
