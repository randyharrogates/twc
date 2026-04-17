import { describe, expect, it } from 'vitest';
import { newId } from '../lib/id';

describe('newId', () => {
  it('produces a UUID-shaped string', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('produces unique values across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId()));
    expect(ids.size).toBe(100);
  });
});
