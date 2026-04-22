import { useState } from 'react';
import type { Group, Member } from '../types';

interface Props {
  group: Group;
  onUpdate: (next: Group) => void;
}

export function MemberList({ group, onUpdate }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  function startEdit(m: Member) {
    setEditing(m.id);
    setDraft(m.name);
  }

  function cancel() {
    setEditing(null);
    setDraft('');
  }

  function save() {
    if (!editing) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    onUpdate({
      ...group,
      version: group.version + 1,
      members: group.members.map((m) => (m.id === editing ? { ...m, name: trimmed } : m)),
    });
    cancel();
  }

  return (
    <section className="border border-[var(--color-ink-200)] rounded p-4">
      <h3 className="text-sm uppercase tracking-wide text-[var(--color-ink-500)] mb-3">Members</h3>
      <ul className="divide-y divide-[var(--color-ink-200)]">
        {group.members.map((m) => (
          <li key={m.id} className="py-2 flex items-center justify-between">
            {editing === m.id ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="flex-1 px-2 py-1 rounded bg-[var(--color-ink-100)] border border-[var(--color-ink-300)]"
                />
                <button type="button" onClick={save} className="text-xs px-2 py-1 rounded bg-[var(--color-accent-700)] text-white">
                  Save
                </button>
                <button type="button" onClick={cancel} className="text-xs px-2 py-1 rounded border border-[var(--color-ink-300)]">
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div>
                  <span className="text-[var(--color-ink-800)]">{m.name}</span>
                  <span className="ml-2 text-xs font-mono text-[var(--color-ink-500)]">{m.id.slice(0, 8)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(m)}
                  className="text-xs px-2 py-1 rounded border border-[var(--color-ink-300)] hover:bg-[var(--color-ink-100)]"
                >
                  Rename
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
