// app/api/memories/route.ts
// 給 UI 顯示「Memory Inspector」用的 REST endpoint
// GET    -> list all
// DELETE ?id=xxx -> remove one

import { createSupabaseServer } from '@/lib/supabase-server';

export async function GET() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data, error } = await supabase
    .from('memories')
    .select('id, key, value, category, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ memories: data });
}

export async function DELETE(req: Request) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return new Response('missing id', { status: 400 });

  const { error } = await supabase
    .from('memories')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ ok: true });
}
