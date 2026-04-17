import { useState } from 'react';
import { useAppStore } from '../state/store';
import type { Group } from '../types';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

interface Props {
  group: Group;
}

export function MembersPanel({ group }: Props) {
  const addMember = useAppStore((s) => s.addMember);
  const renameMember = useAppStore((s) => s.renameMember);
  const deleteMember = useAppStore((s) => s.deleteMember);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    try {
      if (newName.trim()) addMember(group.id, newName.trim());
      setNewName('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const commitRename = (id: string) => {
    try {
      if (editValue.trim()) renameMember(group.id, id, editValue.trim());
      setEditingId(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = (id: string) => {
    setError(null);
    try {
      deleteMember(group.id, id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm tracking-widest text-ink-500">MEMBERS</h3>
        <span className="text-xs text-ink-500">{group.members.length} total</span>
      </div>

      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Add member name"
        />
        <Button variant="primary" onClick={submit} disabled={!newName.trim()}>
          Add
        </Button>
      </div>

      {error && <div className="text-xs text-red-400">{error}</div>}

      <ul className="divide-y divide-ink-200/50 rounded-2xl border border-ink-300 bg-ink-100/40">
        {group.members.length === 0 ? (
          <li className="px-4 py-4 text-xs text-ink-500">No members yet. Add someone to start.</li>
        ) : (
          group.members.map((m) => (
            <li key={m.id} className="flex items-center gap-2 px-4 py-3 text-sm">
              {editingId === m.id ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && commitRename(m.id)}
                    autoFocus
                  />
                  <Button size="sm" variant="primary" onClick={() => commitRename(m.id)}>Save</Button>
                  <Button size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-ink-700">{m.name}</span>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingId(m.id);
                      setEditValue(m.name);
                    }}
                  >
                    Rename
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(m.id)}>
                    Delete
                  </Button>
                </>
              )}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
