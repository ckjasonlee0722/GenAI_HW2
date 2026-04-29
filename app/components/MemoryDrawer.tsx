// app/components/MemoryDrawer.tsx
'use client';

import { useEffect, useState } from 'react';
import { Brain, Trash2, X } from 'lucide-react';

interface Memory {
  id: string;
  key: string;
  value: string;
  category: string;
  updated_at: string;
}

const CAT_COLOR: Record<string, string> = {
  personal: 'text-violet-300 border-violet-500/40 bg-violet-500/10',
  preference: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  context: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  general: 'text-zinc-300 border-zinc-500/40 bg-zinc-500/10',
};

export default function MemoryDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [mems, setMems] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/memories');
      if (r.ok) {
        const { memories } = await r.json();
        setMems(memories);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  const remove = async (id: string) => {
    await fetch(`/api/memories?id=${id}`, { method: 'DELETE' });
    setMems((m) => m.filter((x) => x.id !== id));
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        className="fixed top-0 right-0 h-full w-full max-w-md bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-2xl rise overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <Brain size={18} className="text-[var(--color-accent)]" />
            <div>
              <h2 className="font-display text-xl">Long-term memory</h2>
              <p className="text-xs text-[var(--color-text-faint)] mt-0.5">
                {mems.length} fact{mems.length === 1 ? '' : 's'} remembered
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-dim)]"
          >
            <X size={18} />
          </button>
        </header>

        <div className="p-4 space-y-2">
          {loading && (
            <p className="text-sm text-[var(--color-text-faint)] py-8 text-center">
              loading…
            </p>
          )}
          {!loading && mems.length === 0 && (
            <div className="text-center py-12 px-4">
              <p className="text-sm text-[var(--color-text-dim)] mb-2">
                No memories yet.
              </p>
              <p className="text-xs text-[var(--color-text-faint)]">
                Tell me about yourself — I'll remember automatically.
              </p>
            </div>
          )}
          {mems.map((m) => (
            <div
              key={m.id}
              className="group border border-[var(--color-border)] rounded-lg p-3 bg-[var(--color-surface-2)]/40 hover:border-[var(--color-accent)]/40 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-xs font-mono text-[var(--color-accent)]">
                      {m.key}
                    </code>
                    <span
                      className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                        CAT_COLOR[m.category] ?? CAT_COLOR.general
                      }`}
                    >
                      {m.category}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--color-text)] break-words">
                    {m.value}
                  </p>
                </div>
                <button
                  onClick={() => remove(m.id)}
                  className="opacity-0 group-hover:opacity-100 transition text-[var(--color-text-faint)] hover:text-red-400 p-1"
                  aria-label="delete memory"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
