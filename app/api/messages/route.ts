// app/api/messages/route.ts
// 給前端切換 branch 時撈該 branch 的訊息歷史

import { createSupabaseServer } from '@/lib/supabase-server';

export async function GET(req: Request) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const branchId = url.searchParams.get('branch_id');
  if (!branchId) return new Response('missing branch_id', { status: 400 });

  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('user_id', user.id)
    .eq('branch_id', branchId)
    .order('created_at', { ascending: true });

  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ messages: data ?? [] });
}