// app/components/BranchSidebar.tsx
'use client';

import { GitBranch, GitFork } from 'lucide-react';

export interface BranchInfo {
  branchId: string;
  messageCount: number;
  firstAt: string;
  isActive: boolean;
  label: string;
}

export default function BranchSidebar({
  branches,
  onSelect,
}: {
  branches: BranchInfo[];
  onSelect: (id: string) => void;
}) {
  if (branches.length <= 1) return null;

  return (
    <aside className="border-l border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-5 w-60 hidden lg:block">
      <h3 className="text-xs uppercase tracking-widest text-[var(--color-text-faint)] mb-3 flex items-center gap-2">
        <GitBranch size={12} />
        Branches
      </h3>
      <ul className="space-y-1">
        {branches.map((b, i) => (
          <li key={b.branchId}>
            <button
              onClick={() => onSelect(b.branchId)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition flex items-start gap-2 ${
                b.isActive
                  ? 'bg-[var(--color-accent)]/15 border border-[var(--color-accent)]/40 text-[var(--color-text)]'
                  : 'border border-transparent hover:bg-[var(--color-surface-2)] text-[var(--color-text-dim)]'
              }`}
            >
              <GitFork size={12} className="mt-1 flex-shrink-0 opacity-60" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{b.label || `Branch ${i + 1}`}</div>
                <div className="text-[10px] text-[var(--color-text-faint)] mt-0.5">
                  {b.messageCount} msg · {new Date(b.firstAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
