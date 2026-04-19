import { describe, expect, it } from 'vitest';
import {
  checkAndConsume,
  initialRateLimiterState,
  DEFAULT_LIMITS,
  type RateLimits,
} from '../lib/rateLimiter';

describe('rate limiter — per-minute window', () => {
  it('allows the first 10 requests within a minute with default limits', () => {
    let state = initialRateLimiterState(DEFAULT_LIMITS, 0);
    for (let i = 0; i < 10; i++) {
      const r = checkAndConsume(state, 1000 + i * 100, DEFAULT_LIMITS);
      expect(r.ok).toBe(true);
      if (r.ok) state = r.next;
    }
    const eleventh = checkAndConsume(state, 2000, DEFAULT_LIMITS);
    expect(eleventh.ok).toBe(false);
    if (!eleventh.ok) {
      expect(eleventh.reason).toBe('minute');
      expect(eleventh.retryAfterMs).toBeGreaterThan(0);
      expect(eleventh.retryAfterMs).toBeLessThanOrEqual(60_000);
    }
  });

  it('refills the full per-minute bucket after 60s of idle', () => {
    let state = initialRateLimiterState(DEFAULT_LIMITS, 0);
    for (let i = 0; i < 10; i++) {
      const r = checkAndConsume(state, 0, DEFAULT_LIMITS);
      if (r.ok) state = r.next;
    }
    const after = checkAndConsume(state, 60_000, DEFAULT_LIMITS);
    expect(after.ok).toBe(true);
  });
});

describe('rate limiter — per-hour window', () => {
  it('blocks once per-hour allowance is exhausted even if per-minute has tokens', () => {
    const tightHour: RateLimits = { perMinuteMax: 100, perHourMax: 3 };
    let state = initialRateLimiterState(tightHour, 0);
    // Spread across minutes so per-minute never binds.
    for (let i = 0; i < 3; i++) {
      const r = checkAndConsume(state, i * 120_000, tightHour);
      expect(r.ok).toBe(true);
      if (r.ok) state = r.next;
    }
    const denied = checkAndConsume(state, 3 * 120_000, tightHour);
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe('hour');
  });

  it('returns retryAfterMs ≤ one hour when the hour bucket is exhausted', () => {
    const tightHour: RateLimits = { perMinuteMax: 100, perHourMax: 1 };
    let state = initialRateLimiterState(tightHour, 1000);
    const first = checkAndConsume(state, 1000, tightHour);
    if (first.ok) state = first.next;
    const second = checkAndConsume(state, 1500, tightHour);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.retryAfterMs).toBeGreaterThan(0);
      expect(second.retryAfterMs).toBeLessThanOrEqual(3_600_000);
    }
  });
});

describe('rate limiter — state plumbing', () => {
  it('returns a new state object rather than mutating the input', () => {
    const state = initialRateLimiterState(DEFAULT_LIMITS, 0);
    const before = state.perMinute.tokens;
    const r = checkAndConsume(state, 500, DEFAULT_LIMITS);
    expect(state.perMinute.tokens).toBe(before);
    if (r.ok) expect(r.next.perMinute.tokens).toBe(before - 1);
  });
});
