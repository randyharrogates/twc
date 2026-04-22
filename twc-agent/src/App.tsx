import { useEffect, useState } from 'react';
import { listGroups, getGroup, putGroup, type GroupSummary } from './lib/api';
import type { Group } from './types';
import { GroupView } from './components/GroupView';

export function App() {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      setLoading(true);
      const list = await listGroups();
      setGroups(list);
      if (!selectedId && list.length > 0) setSelectedId(list[0].id);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    (async () => {
      try {
        const g = await getGroup(selectedId);
        setGroup(g);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [selectedId]);

  async function handleUpdate(next: Group) {
    try {
      const saved = await putGroup(next);
      setGroup(saved);
      setError(null);
      void refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-[var(--color-ink-200)] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-ink-800)]">
            TWC-Claude <span className="text-[var(--color-ink-500)] text-sm font-normal">local viewer</span>
          </h1>
          <p className="text-xs text-[var(--color-ink-500)] mt-0.5">
            To add expenses, use Claude Code: <code className="text-[var(--color-accent-400)]">/twc-add-expense</code>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-xs px-3 py-1.5 rounded border border-[var(--color-ink-300)] hover:bg-[var(--color-ink-100)]"
        >
          Reload
        </button>
      </header>

      {error && (
        <div className="mx-6 mt-4 border border-red-500/50 bg-red-500/10 text-red-300 rounded p-3 text-sm font-mono whitespace-pre-wrap">
          {error}
        </div>
      )}

      <main className="flex-1 grid grid-cols-[240px_1fr] gap-6 p-6">
        <aside className="border border-[var(--color-ink-200)] rounded p-3 text-sm">
          <h2 className="text-[var(--color-ink-500)] uppercase tracking-wide text-xs mb-2">Groups</h2>
          {loading && <p className="text-[var(--color-ink-500)]">Loading…</p>}
          {!loading && groups.length === 0 && (
            <p className="text-[var(--color-ink-500)]">
              No groups yet. Run <code className="text-[var(--color-accent-400)]">/twc-new-group</code> in Claude Code.
            </p>
          )}
          <ul className="space-y-1">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(g.id)}
                  className={`w-full text-left px-2 py-1 rounded ${
                    selectedId === g.id
                      ? 'bg-[var(--color-accent-700)]/30 text-[var(--color-accent-300)]'
                      : 'hover:bg-[var(--color-ink-100)]'
                  }`}
                >
                  <div>{g.name}</div>
                  <div className="text-xs text-[var(--color-ink-500)]">
                    {g.baseCurrency} · v{g.version}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section>
          {group ? (
            <GroupView group={group} onUpdate={handleUpdate} />
          ) : (
            <div className="text-[var(--color-ink-500)]">Select a group to view.</div>
          )}
        </section>
      </main>
    </div>
  );
}
