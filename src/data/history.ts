import {
  validateSnapshot,
  type AirportSnapshot,
  type FloorId,
} from "./incheon.js";
export function normalizeHistory(input: unknown[]): AirportSnapshot[] {
  const unique = new Map<number, AirportSnapshot>();
  for (const value of input) {
    const s = validateSnapshot(value);
    unique.set(Date.parse(s.updatedAt), s);
  }
  return [...unique]
    .sort((a, b) => a[0] - b[0])
    .slice(-2400)
    .map(([, s]) => s);
}
export function observedSeries(history: AirportSnapshot[], floor: FloorId) {
  const sorted = normalizeHistory(history),
    start = sorted.length ? Date.parse(sorted[0]!.updatedAt) : 0;
  return sorted.map((s) => ({
    minute: (Date.parse(s.updatedAt) - start) / 60000,
    occupancyPercent: s.floors.find((f) => f.id === floor)!.occupancyPercent,
    available: s.floors.find((f) => f.id === floor)!.available,
    updatedAt: s.updatedAt,
  }));
}
