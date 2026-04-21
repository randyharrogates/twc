import type { Group } from '../types';
import { GroupSchema } from './schema';

export interface GroupSummary {
  id: string;
  name: string;
  baseCurrency: string;
  version: number;
}

export async function listGroups(): Promise<GroupSummary[]> {
  const res = await fetch('/api/groups');
  if (!res.ok) throw new Error(`listGroups ${res.status}`);
  return (await res.json()) as GroupSummary[];
}

export async function getGroup(id: string): Promise<Group> {
  const res = await fetch(`/api/groups/${id}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`getGroup ${res.status}: ${body}`);
  }
  const parsed = GroupSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new Error(`getGroup: schema violation — ${parsed.error.message}`);
  }
  return parsed.data as Group;
}

export async function putGroup(group: Group): Promise<Group> {
  const res = await fetch(`/api/groups/${group.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(group),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `putGroup ${res.status}`);
  }
  return (await res.json()) as Group;
}
