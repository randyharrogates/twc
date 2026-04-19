export interface Bucket {
  tokens: number;
  refilledAt: number;
}

export interface RateLimiterState {
  perMinute: Bucket;
  perHour: Bucket;
}

export interface RateLimits {
  perMinuteMax: number;
  perHourMax: number;
}

export const DEFAULT_LIMITS: RateLimits = {
  perMinuteMax: 10,
  perHourMax: 100,
};

export function initialRateLimiterState(limits: RateLimits = DEFAULT_LIMITS, nowMs = 0): RateLimiterState {
  return {
    perMinute: { tokens: limits.perMinuteMax, refilledAt: nowMs },
    perHour: { tokens: limits.perHourMax, refilledAt: nowMs },
  };
}

function refill(bucket: Bucket, max: number, windowMs: number, nowMs: number): Bucket {
  const elapsed = nowMs - bucket.refilledAt;
  if (elapsed <= 0) return bucket;
  if (elapsed >= windowMs) {
    return { tokens: max, refilledAt: nowMs };
  }
  const gain = Math.floor((elapsed / windowMs) * max);
  if (gain <= 0) return bucket;
  return {
    tokens: Math.min(max, bucket.tokens + gain),
    refilledAt: bucket.refilledAt + Math.floor((gain / max) * windowMs),
  };
}

export type ConsumeResult =
  | { ok: true; next: RateLimiterState }
  | { ok: false; retryAfterMs: number; next: RateLimiterState; reason: 'minute' | 'hour' };

export function checkAndConsume(
  state: RateLimiterState,
  nowMs: number,
  limits: RateLimits = DEFAULT_LIMITS,
): ConsumeResult {
  const perMinute = refill(state.perMinute, limits.perMinuteMax, 60_000, nowMs);
  const perHour = refill(state.perHour, limits.perHourMax, 3_600_000, nowMs);

  if (perMinute.tokens <= 0) {
    const retryAfterMs = Math.max(0, 60_000 - (nowMs - perMinute.refilledAt));
    return { ok: false, retryAfterMs, next: { perMinute, perHour }, reason: 'minute' };
  }
  if (perHour.tokens <= 0) {
    const retryAfterMs = Math.max(0, 3_600_000 - (nowMs - perHour.refilledAt));
    return { ok: false, retryAfterMs, next: { perMinute, perHour }, reason: 'hour' };
  }
  return {
    ok: true,
    next: {
      perMinute: { ...perMinute, tokens: perMinute.tokens - 1 },
      perHour: { ...perHour, tokens: perHour.tokens - 1 },
    },
  };
}
