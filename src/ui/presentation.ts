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
  value.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
export function frameAt(result: TwinResult, time: number): Frame {
  return result.frames[Math.min(Math.floor(time), result.metrics.endTime)]!;
}
