// app/api/branch/route.ts
// 從某條 user message 分叉出新 branch
//
// POST { conversationId, fromMessageId }
//   → 回傳 { branchId, history: Message[] }
//
// 邏輯：
//   1. 取得 fromMessageId 之前（含）的所有訊息（沿著 parent_id 往上）
//   2. 產一個新的 branch_id (uuid)
//   3. 前端拿這串 history + new branchId 開始新對話
//
// Branch 不複製訊息（節省空間），靠 parent_id 鏈取出來

import { createSupabaseServer } from '@/lib/supabase-server';
import { randomUUID } from 'crypto';

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { conversationId, fromMessageId } = await req.json();

  // 從 fromMessageId 沿 parent_id 往上爬取得 history
  const history: Array<{
    id: string;
    role: string;
    content: string;
    parent_id: string | null;
  }> = [];

  let cursor: string | null = fromMessageId;
  // 防無限迴圈：max 200 步
  for (let i = 0; i < 200 && cursor; i++) {
    const { data, error } = await supabase
      .from('messages')
      .select('id, role, content, parent_id')
      .eq('id', cursor)
      .eq('user_id', user.id)
      .single();
    if (error || !data) break;
    history.unshift(data);
    cursor = data.parent_id;
  }

  const newBranchId = randomUUID();

  return Response.json({
    branchId: newBranchId,
    conversationId,
    history,
  });
}

// GET ?conversationId=xxx → 列出該對話所有 branch
export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const convId = url.searchParams.get('conversationId');
  if (!convId) return new Response('missing conversationId', { status: 400 });

  const { data } = await supabase
    .from('messages')
    .select('branch_id, parent_id, created_at')
    .eq('conversation_id', convId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  // 依 branch_id 分組
  const branches: Record<
    string,
    { messageCount: number; firstAt: string; rootMsgId: string | null }
  > = {};
  for (const m of data ?? []) {
    const b = (branches[m.branch_id] ??= {
      messageCount: 0,
      firstAt: m.created_at,
      rootMsgId: m.parent_id,
    });
    b.messageCount++;
  }
  return Response.json({ branches });
}
