import type { Frame, TwinResult } from "../twin/model.js";
export const labels: Record<string, string> = {
  nearest: "Nearest",
  random: "Random",
  rule: "Rule-based",
  rl: "DQN / RL",
};
export const phaseLabels: Record<string, string> = {
  inbound: "입차 이동",
  parking: "주차 조작",
  parked: "주차 중",
  outbound: "출차 이동",
  exited: "출차 완료",
  rejected: "미배정",
};
export const fmt = (value: number, digits = 1) =>
  (Math.abs(value) < 0.5 * 10 ** -digits ? 0 : value).toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
export function frameAt(result: TwinResult, time: number): Frame {
  const safeTime = Number.isFinite(time) ? time : 0;
  return result.frames[
    Math.max(0, Math.min(Math.floor(safeTime), result.metrics.endTime))
  ]!;
}

/** RAF timestamps can precede effect setup by a fraction of a millisecond. */
export function advanceTime(
  time: number,
  elapsedMs: number,
  speed: number,
  end: number,
): number {
  const elapsed = Number.isFinite(elapsedMs)
    ? Math.max(0, Math.min(100, elapsedMs))
    : 0;
  return Math.max(0, Math.min(end, time + (elapsed / 350) * speed));
}
