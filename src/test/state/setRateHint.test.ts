import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../state/store';

function reset() {
  useAppStore.getState().resetAll();
  localStorage.clear();
}

describe('store.setRateHint', () => {
  beforeEach(reset);

  it('persists a rate into the active group', () => {
    const gid = useAppStore.getState().createGroup('Trip', 'SGD');
    useAppStore.getState().setRateHint(gid, 'MYR', 0.29);
    expect(useAppStore.getState().groups[gid].rateHints.MYR).toBe(0.29);
  });

  it('overwrites a prior rate for the same currency', () => {
    const gid = useAppStore.getState().createGroup('Trip', 'SGD');
    useAppStore.getState().setRateHint(gid, 'MYR', 0.3);
    useAppStore.getState().setRateHint(gid, 'MYR', 0.29);
    expect(useAppStore.getState().groups[gid].rateHints.MYR).toBe(0.29);
  });

  it('accepts a 0-decimal currency rate (JPY → SGD)', () => {
    const gid = useAppStore.getState().createGroup('Tokyo', 'SGD');
    useAppStore.getState().setRateHint(gid, 'JPY', 0.0089);
    expect(useAppStore.getState().groups[gid].rateHints.JPY).toBe(0.0089);
  });

  it('leaves other groups untouched (per-group isolation)', () => {
    const a = useAppStore.getState().createGroup('A', 'SGD');
    const b = useAppStore.getState().createGroup('B', 'SGD');
    useAppStore.getState().setRateHint(a, 'MYR', 0.29);
    expect(useAppStore.getState().groups[b].rateHints.MYR).toBeUndefined();
  });

  it('rejects a zero rate', () => {
    const gid = useAppStore.getState().createGroup('G', 'SGD');
    expect(() => useAppStore.getState().setRateHint(gid, 'MYR', 0)).toThrow(/positive/i);
  });

  it('rejects a negative rate', () => {
    const gid = useAppStore.getState().createGroup('G', 'SGD');
    expect(() => useAppStore.getState().setRateHint(gid, 'MYR', -1)).toThrow(/positive/i);
  });

  it('rejects NaN', () => {
    const gid = useAppStore.getState().createGroup('G', 'SGD');
    expect(() => useAppStore.getState().setRateHint(gid, 'MYR', Number.NaN)).toThrow(/positive/i);
  });

  it('throws on unknown groupId', () => {
    expect(() => useAppStore.getState().setRateHint('nonexistent', 'MYR', 0.29)).toThrow(
      /Unknown groupId/,
    );
  });

  it('does not mutate other rateHint entries', () => {
    const gid = useAppStore.getState().createGroup('G', 'SGD');
    useAppStore.getState().setRateHint(gid, 'MYR', 0.29);
    useAppStore.getState().setRateHint(gid, 'JPY', 0.0089);
    expect(useAppStore.getState().groups[gid].rateHints).toEqual({ MYR: 0.29, JPY: 0.0089 });
  });
});
