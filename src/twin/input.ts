import { parseVehiclesCsv } from "../vehicles-csv.js";
import { createLayout } from "./layout.js";
import type { Scenario } from "./model.js";

export function scenarioFromCsv(
  content: string,
  title = "사용자 CSV",
  seed = 42,
): Scenario {
  const vehicles = parseVehiclesCsv(content);
  return {
    id: "csv",
    title,
    description: "사용자 CSV · 체류시간은 주차 완료 후부터 적용",
    seed,
    observationEnd:
      Math.max(...vehicles.map((v) => v.arrivalTime + v.duration)) + 30,
    layout: createLayout(),
    vehicles: vehicles.map((v) => ({
      ...v,
      estimatedDeparture: v.arrivalTime + v.duration + 6,
    })),
  };
}
