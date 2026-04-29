// lib/models.ts
// 中央化的 model registry — routing 跟 UI 都從這裡取資訊
// 換模型只要改這個檔案

import { groq } from '@ai-sdk/groq';

export type ModelKey =
  | 'fast'         // 快速、簡單對話
  | 'reasoning'    // 推理、長回答、tool use
  | 'vision'       // 多模態
  | 'router';      // 路由分類器自己用

export interface ModelSpec {
  id: string;                   // Groq model id
  label: string;                // UI 顯示名稱
  description: string;          // 給助教看的說明
  supportsVision: boolean;
  supportsTools: boolean;
  badgeColor: string;           // UI badge 用
}

export const MODELS: Record<ModelKey, ModelSpec> = {
  fast: {
    id: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B',
    description: '快速回應，用於簡單聊天 / 短問題',
    supportsVision: false,
    supportsTools: true,
    badgeColor: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  reasoning: {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B',
    description: '深度推理、程式、長回答、tool calling',
    supportsVision: false,
    supportsTools: true,
    badgeColor: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  },
  vision: {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout',
    description: '多模態 (vision)，處理圖片輸入',
    supportsVision: true,
    supportsTools: true,
    badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  router: {
    id: 'llama-3.1-8b-instant',
    label: 'Router',
    description: '輕量分類器，決定要呼叫哪個主模型',
    supportsVision: false,
    supportsTools: false,
    badgeColor: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  },
};

// AI SDK provider factory
export function getModel(key: ModelKey) {
  return groq(MODELS[key].id);
}
