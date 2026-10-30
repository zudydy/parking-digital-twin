import { seededRandom } from "../twin/strategies.js";
export const mean = (v: number[]) =>
  v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
export const sampleStd = (v: number[]) =>
  v.length > 1
    ? Math.sqrt(
        v.reduce((sum, x) => sum + (x - mean(v)) ** 2, 0) / (v.length - 1),
      )
    : 0;
export function percentile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const x = (sorted.length - 1) * q,
    low = Math.floor(x);
  return sorted[low]! + (sorted[Math.ceil(x)]! - sorted[low]!) * (x - low);
}
/** Crossed bootstrap: resample learning seeds and shared traffic seeds, preserving paired differences. */
export function crossedPairedCI(
  matrix: number[][],
  iterations = 2000,
  seed = 42,
): [number, number] {
  if (!matrix.length || !matrix[0]?.length)
    throw new Error("신뢰구간 표본이 비어 있습니다.");
  const width = matrix[0].length;
  if (
    matrix.some(
      (row) => row.length !== width || row.some((v) => !Number.isFinite(v)),
    )
  )
    throw new Error("대응 표본 크기·값이 유효하지 않습니다.");
  const rng = seededRandom(seed),
    samples: number[] = [];
  for (let n = 0; n < iterations; n++) {
    const learners = Array.from({ length: matrix.length }, () =>
        Math.floor(rng() * matrix.length),
      ),
      traffic = Array.from({ length: width }, () => Math.floor(rng() * width));
    let sum = 0;
    for (const l of learners) for (const t of traffic) sum += matrix[l]![t]!;
    samples.push(sum / (learners.length * traffic.length));
  }
  samples.sort((a, b) => a - b);
  return [percentile(samples, 0.025), percentile(samples, 0.975)];
}
