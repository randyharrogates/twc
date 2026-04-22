export function distributeProportional(
  totalMinor: number,
  weights: number[],
): number[] {
  if (!Number.isInteger(totalMinor)) {
    throw new Error(`distributeProportional: totalMinor must be an integer, got ${totalMinor}`);
  }
  if (totalMinor < 0) {
    throw new Error('distributeProportional: totalMinor must be non-negative');
  }
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new Error('distributeProportional: weights must be non-negative finite numbers');
  }

  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) return weights.map(() => 0);

  const raw = weights.map((w) => (totalMinor * w) / weightSum);
  const floored = raw.map(Math.floor);
  let residual = totalMinor - floored.reduce((a, b) => a + b, 0);

  const ranked = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const out = [...floored];
  for (const { i } of ranked) {
    if (residual <= 0) break;
    out[i] += 1;
    residual -= 1;
  }
  return out;
}

export function sumMinor(amounts: number[]): number {
  return amounts.reduce((a, b) => a + b, 0);
}
