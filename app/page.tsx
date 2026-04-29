// app/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase-browser';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';
import {
  Brain,
  GitFork,
  ImagePlus,
  Send,
  Wrench,
  Cpu,
  Sparkles,
  X,
  LogOut,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MemoryDrawer from './components/MemoryDrawer';
import BranchSidebar, { BranchInfo } from './components/BranchSidebar';

type SendPart =
  | { type: 'text'; text: string }
  | { type: 'file'; mediaType: string; url: string; filename: string };

interface RoutingBadge {
  model: string;
  label: string;
  reason: string;
  method: string;
}

export default function ChatPage() {
  // ----- auth guard -----
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login');
      } else {
        setUserEmail(user.email ?? null);
        setAuthChecked(true);
      }
    });
  }, [router]);

  // ----- conversation / branch state -----
  const [conversationId] = useState(() => crypto.randomUUID());
  const [branchId, setBranchId] = useState(conversationId);
  const [branches, setBranches] = useState<BranchInfo[]>([
    {
      branchId: conversationId,
      messageCount: 0,
      firstAt: new Date().toISOString(),
      isActive: true,
      label: 'main',
    },
  ]);

  // ----- UI state -----
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState<{
    dataUrl: string;
    name: string;
  } | null>(null);
  const [routing, setRouting] = useState<RoutingBadge | null>(null);
  const [draft, setDraft] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // ----- AI SDK chat -----
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      prepareSendMessagesRequest({ messages }) {
        return {
          body: { messages, conversationId, branchId, parentId: null },
        };
      },
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        setRouting({
          model: res.headers.get('X-Routed-Model') ?? '',
          label: decodeURIComponent(res.headers.get('X-Routed-Label') ?? ''),
          reason: decodeURIComponent(res.headers.get('X-Routed-Reason') ?? ''),
          method: res.headers.get('X-Routed-Method') ?? '',
        });
        return res;
      },
    }),
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  // ----- send handler -----
  const handleSend = async () => {
    if (!draft.trim() && !pendingImage) return;
    const parts: SendPart[] = [];
    if (pendingImage) {
      const mimeMatch = pendingImage.dataUrl.match(/^data:([^;]+);base64,/);
      const realMime = mimeMatch?.[1] ?? 'image/png';
      parts.push({
        type: 'file',
        mediaType: realMime,
        url: pendingImage.dataUrl,
        filename: pendingImage.name,
      });
    }
    if (draft.trim()) parts.push({ type: 'text', text: draft });

    sendMessage({ role: 'user', parts });
    setDraft('');
    setPendingImage(null);
  };

  // ----- image upload -----
  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setPendingImage({
        dataUrl: String(reader.result),
        name: file.name,
      });
    reader.readAsDataURL(file);
  };

  // ----- branching -----
  const forkFrom = (msgId: string) => {
    const newBranchId = crypto.randomUUID();
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    // 截斷在 fork 點之前（不含），讓 user 重新打不同的問題
    const trimmed = messages.slice(0, idx);
    setMessages(trimmed);
    setBranchId(newBranchId);
    setBranches((bs) => [
      ...bs.map((b) => ({ ...b, isActive: false })),
      {
        branchId: newBranchId,
        messageCount: trimmed.length,
        firstAt: new Date().toISOString(),
        isActive: true,
        label: `fork ${bs.length}`,
      },
    ]);
  };

  // ----- switch to existing branch (load its history from Supabase) -----
  const switchBranch = async (targetBranchId: string) => {
    if (targetBranchId === branchId) return;
    setBranchId(targetBranchId);
    setBranches((bs) =>
      bs.map((b) => ({ ...b, isActive: b.branchId === targetBranchId })),
    );

    try {
      const res = await fetch(`/api/messages?branch_id=${targetBranchId}`);
      if (!res.ok) return;
      const { messages: rows } = await res.json();
      const reconstructed = (rows ?? []).map(
        (row: { id: string; role: string; content: string }) => ({
          id: row.id,
          role: row.role as 'user' | 'assistant',
          parts: [{ type: 'text' as const, text: row.content }],
        }),
      );
      setMessages(reconstructed as unknown as typeof messages);
    } catch (e) {
      console.error('switchBranch error:', e);
    }
  };

  // auto-scroll
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--color-text-faint)] text-sm">
        loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* ============ Header ============ */}
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/40 backdrop-blur-md sticky top-0 z-30 rise">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-md bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] flex items-center justify-center">
              <Sparkles size={16} className="text-black" />
            </div>
            <div>
              <h1 className="font-display text-2xl leading-none italic">
                GenAI{' '}
                <span className="not-italic font-mono text-base text-[var(--color-text-dim)]">
                  v2
                </span>
              </h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-faint)] mt-0.5">
                memory · multimodal · routing · tools · mcp · branching
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {routing && <RoutingBadge {...routing} />}
            {userEmail && (
              <span className="text-[10px] text-[var(--color-text-faint)] font-mono mr-1 hidden sm:inline">
                {userEmail}
              </span>
            )}
            <button
              onClick={() => setMemoryOpen(true)}
              className="px-3 py-1.5 text-xs border border-[var(--color-border)] hover:border-[var(--color-accent)]/40 rounded-md flex items-center gap-2 transition"
            >
              <Brain size={13} />
              Memory
            </button>
            <button
              onClick={async () => {
                const supabase = createSupabaseBrowser();
                await supabase.auth.signOut();
                router.push('/login');
              }}
              className="px-3 py-1.5 text-xs border border-[var(--color-border)] hover:border-red-400/40 hover:text-red-300 rounded-md flex items-center gap-2 transition"
              title="Sign out"
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* ============ Body ============ */}
      <div className="flex-1 flex max-w-6xl mx-auto w-full">
        <main
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-6 py-8 space-y-6"
        >
          {messages.length === 0 && <Welcome />}
          {messages.map((m) => (
            <MessageBubble key={m.id} m={m} onFork={forkFrom} />
          ))}
          {isStreaming && (
            <div className="text-xs text-[var(--color-text-faint)] flex items-center gap-2 pl-12">
              <Cpu size={12} className="animate-pulse" />
              {routing?.label ?? 'thinking'}…
            </div>
          )}
        </main>

        <BranchSidebar branches={branches} onSelect={switchBranch} />
      </div>

      {/* ============ Composer ============ */}
      <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]/40 backdrop-blur-md sticky bottom-0">
        <div className="max-w-6xl mx-auto px-6 py-4">
          {pendingImage && (
            <div className="mb-3 inline-flex items-center gap-2 bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-md p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pendingImage.dataUrl}
                alt={pendingImage.name}
                className="size-12 object-cover rounded"
              />
              <span className="text-xs text-[var(--color-text-dim)]">
                {pendingImage.name}
              </span>
              <button
                onClick={() => setPendingImage(null)}
                className="text-[var(--color-text-faint)] hover:text-red-400 p-1"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 bg-[var(--color-surface-2)] border border-[var(--color-border)] focus-within:border-[var(--color-accent)]/40 rounded-xl p-2 transition">
            <button
              onClick={() => fileRef.current?.click()}
              className="p-2 text-[var(--color-text-dim)] hover:text-[var(--color-accent)] transition"
              aria-label="attach image"
              title="Attach image — auto-routes to vision model"
            >
              <ImagePlus size={18} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={onPickImage}
            />
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask anything — try uploading an image, doing math, or asking me to remember something."
              rows={1}
              className="flex-1 bg-transparent resize-none outline-none py-2 px-1 text-sm placeholder:text-[var(--color-text-faint)] max-h-40"
            />
            <button
              onClick={handleSend}
              disabled={isStreaming || (!draft.trim() && !pendingImage)}
              className="size-9 rounded-lg bg-[var(--color-accent)] text-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center"
            >
              <Send size={15} />
            </button>
          </div>
          <p className="text-[10px] text-[var(--color-text-faint)] mt-2 text-center">
            Press{' '}
            <kbd className="px-1 py-0.5 border border-[var(--color-border)] rounded text-[9px]">
              Enter
            </kbd>{' '}
            to send ·{' '}
            <kbd className="px-1 py-0.5 border border-[var(--color-border)] rounded text-[9px]">
              Shift+Enter
            </kbd>{' '}
            for newline
          </p>
        </div>
      </footer>

      <MemoryDrawer open={memoryOpen} onClose={() => setMemoryOpen(false)} />
    </div>
  );
}

/* =================================================================== */
/*                            Sub-components                             */
/* =================================================================== */

function Welcome() {
  const features = [
    {
      icon: Brain,
      t: 'Long-term memory',
      d: 'I remember facts about you across sessions.',
    },
    {
      icon: ImagePlus,
      t: 'Multimodal',
      d: 'Drop an image — auto-routes to a vision model.',
    },
    {
      icon: Cpu,
      t: 'Auto routing',
      d: 'Each query goes to the best-fit model.',
    },
    {
      icon: Wrench,
      t: 'Tools + MCP',
      d: 'Web search, calculator, memory recall, MCP server.',
    },
    {
      icon: GitFork,
      t: 'Branch conversations',
      d: 'Fork from any message to explore alternates.',
    },
  ];
  return (
    <div className="rise space-y-6 max-w-2xl mx-auto pt-8">
      <h2 className="font-display text-5xl leading-tight">
        Hello.{' '}
        <span className="italic text-[var(--color-text-dim)]">
          What shall we explore today?
        </span>
      </h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {features.map((f, i) => (
          <div
            key={f.t}
            className="border border-[var(--color-border)] rounded-lg p-3 bg-[var(--color-surface)]/50 rise"
            style={{ animationDelay: `${0.1 + i * 0.05}s` }}
          >
            <f.icon size={14} className="text-[var(--color-accent)] mb-2" />
            <h3 className="text-sm font-medium">{f.t}</h3>
            <p className="text-xs text-[var(--color-text-dim)] mt-1">{f.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoutingBadge({ label, reason, method }: RoutingBadge) {
  return (
    <div
      className="text-xs flex items-center gap-2 px-2.5 py-1 rounded-md border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-mono rise"
      title={`${reason} (decided by ${method})`}
    >
      <Cpu size={11} />
      <span>routed → {label}</span>
    </div>
  );
}

interface UIPart {
  type: string;
  text?: string;
  url?: string;
  mediaType?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
}

function MessageBubble({
  m,
  onFork,
}: {
  m: { id: string; role: string; parts?: UIPart[] };
  onFork: (id: string) => void;
}) {
  const isUser = m.role === 'user';
  return (
    <div className={`group flex gap-3 ${isUser ? 'flex-row-reverse' : ''} rise`}>
      <div
        className={`size-8 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-mono mt-1 ${
          isUser
            ? 'bg-[var(--color-accent)] text-black'
            : 'bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-accent-2)]'
        }`}
      >
        {isUser ? 'U' : 'A'}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block max-w-[85%] text-left rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-[var(--color-accent)]/12 border border-[var(--color-accent)]/30'
              : 'bg-[var(--color-surface)] border border-[var(--color-border)]'
          }`}
        >
          {(m.parts ?? []).map((p, i) => {
            if (p.type === 'text' && p.text) {
              return (
                <div key={i} className="prose-chat text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {p.text}
                  </ReactMarkdown>
                </div>
              );
            }
            if (p.type === 'file' && p.url) {
              // eslint-disable-next-line @next/next/no-img-element
              return (
                <img
                  key={i}
                  src={p.url}
                  alt="attachment"
                  className="rounded-lg max-w-full max-h-64 my-1"
                />
              );
            }
            if (p.type?.startsWith('tool-')) {
              return <ToolCallRow key={i} part={p} />;
            }
            return null;
          })}
        </div>
        {isUser && (
          <button
            onClick={() => onFork(m.id)}
            className="opacity-0 group-hover:opacity-100 transition mt-1 text-[10px] text-[var(--color-text-faint)] hover:text-[var(--color-accent)] inline-flex items-center gap-1"
          >
            <GitFork size={10} /> branch from here
          </button>
        )}
      </div>
    </div>
  );
}

function ToolCallRow({ part }: { part: UIPart }) {
  const name = part.type?.replace('tool-', '') ?? 'tool';
  return (
    <details className="my-1 text-xs border border-[var(--color-border)] rounded-md bg-[var(--color-surface-2)]/50">
      <summary className="cursor-pointer px-2 py-1.5 flex items-center gap-1.5 text-[var(--color-text-dim)] hover:text-[var(--color-accent)] list-none">
        <Wrench size={11} />
        <code className="font-mono">{name}</code>
        <span className="text-[var(--color-text-faint)] ml-auto">tool call</span>
      </summary>
      <pre className="px-3 py-2 text-[10px] font-mono text-[var(--color-text-dim)] overflow-x-auto border-t border-[var(--color-border)]">
        {JSON.stringify({ args: part.args, result: part.result }, null, 2)}
      </pre>
    </details>
  );
}