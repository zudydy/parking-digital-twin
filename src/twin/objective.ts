/** Per-run score is lexicographic: one extra rejection always dominates all operating costs. */
export const OBJECTIVE_VERSION = "service-first-v2" as const;
export const REWARD_SCALE = 100;
export function serviceScore(
  rejected: number,
  operatingCost: number,
  scale: number,
): number {
  if (
    !Number.isSafeInteger(rejected) ||
    rejected < 0 ||
    !Number.isFinite(operatingCost) ||
    operatingCost < 0 ||
    !Number.isFinite(scale) ||
    scale <= 0
  )
    throw new Error("목적함수 입력이 유효하지 않습니다.");
  return rejected + operatingCost / (scale + operatingCost);
}
/** Across multiple runs, compare mean rejection rate first, then operating cost per input vehicle. */
export function compareValidation(
  a: { rejectionRate: number; operatingPerVehicle: number },
  b: { rejectionRate: number; operatingPerVehicle: number },
) {
  return Math.abs(a.rejectionRate - b.rejectionRate) > 1e-10
    ? a.rejectionRate - b.rejectionRate
    : a.operatingPerVehicle - b.operatingPerVehicle;
}
