import { beforeEach, describe, expect, it } from 'vitest';
import { putImage, getImage, forgetImage, clearImageCache, knownImageIds } from '../state/imageCache';

describe('image cache', () => {
  beforeEach(() => clearImageCache());

  it('stores and retrieves base64 by message id', () => {
    putImage('m1', 'AAAA');
    expect(getImage('m1')).toBe('AAAA');
  });

  it('returns undefined for unknown ids', () => {
    expect(getImage('never')).toBeUndefined();
  });

  it('forgets a single entry without touching others', () => {
    putImage('m1', 'A');
    putImage('m2', 'B');
    forgetImage('m1');
    expect(getImage('m1')).toBeUndefined();
    expect(getImage('m2')).toBe('B');
  });

  it('clearImageCache wipes every entry', () => {
    putImage('m1', 'A');
    putImage('m2', 'B');
    clearImageCache();
    expect(knownImageIds()).toEqual([]);
  });
});
