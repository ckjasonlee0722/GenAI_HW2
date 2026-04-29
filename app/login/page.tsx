// app/login/page.tsx
'use client';

import { useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase-browser';
import { Mail, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async () => {
    if (!email) return;
    setStatus('sending');
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
    } else {
      setStatus('sent');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md rise">
        <div className="flex items-center gap-3 mb-8">
          <div className="size-10 rounded-md bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] flex items-center justify-center">
            <Sparkles size={18} className="text-black" />
          </div>
          <div>
            <h1 className="font-display text-3xl leading-none italic">
              GenAI <span className="not-italic font-mono text-base text-[var(--color-text-dim)]">v2</span>
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)] mt-1">
              sign in to continue
            </p>
          </div>
        </div>

        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
          {status === 'sent' ? (
            <div className="text-center py-4">
              <Mail size={32} className="mx-auto mb-3 text-[var(--color-accent)]" />
              <h2 className="font-display text-xl mb-2">Check your inbox</h2>
              <p className="text-sm text-[var(--color-text-dim)]">
                We sent a magic link to <strong className="text-white">{email}</strong>.
                Click it to sign in.
              </p>
              <button
                onClick={() => { setStatus('idle'); setEmail(''); }}
                className="mt-4 text-xs text-[var(--color-text-faint)] hover:text-[var(--color-accent)] underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <label className="block text-xs uppercase tracking-wider text-[var(--color-text-faint)] mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="you@example.com"
                className="w-full bg-[var(--color-surface-2)] border border-[var(--color-border)] focus:border-[var(--color-accent)]/40 rounded-lg px-3 py-2.5 text-sm outline-none transition"
              />
              <button
                onClick={handleSubmit}
                disabled={!email || status === 'sending'}
                className="w-full mt-4 bg-[var(--color-accent)] text-black font-medium py-2.5 rounded-lg hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {status === 'sending' ? 'Sending magic link…' : 'Send magic link'}
              </button>
              {status === 'error' && (
                <p className="text-xs text-red-400 mt-3">{errorMsg}</p>
              )}
              <p className="text-[10px] text-[var(--color-text-faint)] mt-4 text-center">
                We'll email you a link — no password needed.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
