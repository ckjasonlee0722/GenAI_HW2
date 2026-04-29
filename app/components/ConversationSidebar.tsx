// app/components/ConversationSidebar.tsx
'use client';

import { MessageSquare, Plus } from 'lucide-react';

export interface ConversationItem {
  id: string;
  title: string | null;
  preview: string;
  updated_at: string;
}

export default function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
}: {
  conversations: ConversationItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <aside className="border-r border-[var(--color-border)] bg-[var(--color-surface)]/40 w-64 hidden md:flex md:flex-col">
      <div className="px-4 py-4 border-b border-[var(--color-border)]">
        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[var(--color-surface-2)] border border-[var(--color-border)] hover:border-[var(--color-accent)]/40 rounded-md text-sm transition"
        >
          <Plus size={14} />
          New conversation
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <h3 className="text-[10px] uppercase tracking-widest text-[var(--color-text-faint)] px-2 py-1 mb-1">
          Recent
        </h3>
        {conversations.length === 0 && (
          <p className="text-xs text-[var(--color-text-faint)] px-2 py-3">
            No conversations yet.
          </p>
        )}
        <ul className="space-y-1">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={`w-full text-left px-2 py-2 rounded-md text-xs transition flex items-start gap-2 ${
                  c.id === activeId
                    ? 'bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/30'
                    : 'border border-transparent hover:bg-[var(--color-surface-2)]'
                }`}
              >
                <MessageSquare
                  size={11}
                  className="mt-0.5 flex-shrink-0 text-[var(--color-text-faint)]"
                />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-[var(--color-text)]">
                    {c.title || c.preview || '(untitled)'}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-faint)] mt-0.5">
                    {new Date(c.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}