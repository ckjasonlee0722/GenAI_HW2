// app/api/conversations/route.ts
// 列出 user 所有 conversations，附上每個 conv 的第一條 user message 當 preview

import { createSupabaseServer } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: convs } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(50);

  if (!convs) return Response.json({ conversations: [] });

  const ids = convs.map((c) => c.id);
  const { data: firstMsgs } = await supabase
    .from('messages')
    .select('conversation_id, content, created_at')
    .in('conversation_id', ids)
    .eq('role', 'user')
    .order('created_at', { ascending: true });

  const previewMap: Record<string, string> = {};
  for (const m of firstMsgs ?? []) {
    if (!previewMap[m.conversation_id]) {
      previewMap[m.conversation_id] = m.content.slice(0, 60);
    }
  }

  const enriched = convs.map((c) => ({
    id: c.id,
    title: c.title,
    preview: previewMap[c.id] ?? '(empty)',
    updated_at: c.updated_at,
  }));

  return Response.json({ conversations: enriched });
}