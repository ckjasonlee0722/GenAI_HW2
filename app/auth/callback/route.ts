// app/auth/callback/route.ts
// Magic link 點開後 Supabase 把 user 導到這裡，
// 我們交換 token 後再導去首頁。

import { createSupabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');

  if (code) {
    const supabase = await createSupabaseServer();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL('/', url.origin));
}
