import { createLayout } from "./layout.js";
import type { Scenario } from "./model.js";
import { seededRandom } from "./strategies.js";
export const scenarioTypes = ["office", "cinema", "mall"] as const;
export type ScenarioType = (typeof scenarioTypes)[number];
const labels = {
  office: ["사무실", "출근 시간 입차와 퇴근 시간 출차가 집중되는 반복 수요"],
  cinema: ["공연장", "공연 전 입차와 공연 종료 후 집중 출차"],
  mall: ["쇼핑몰", "짧은 방문과 장기 방문이 섞인 불규칙한 입·출차"],
};
export function createScenario(
  type: ScenarioType,
  seed = 42,
  count = 70,
  uncertainty = 6,
): Scenario {
  if (
    !Number.isSafeInteger(seed) ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 500 ||
    !Number.isFinite(uncertainty) ||
    uncertainty < 0 ||
    uncertainty > 100
  )
    throw new Error("시나리오 설정을 확인하세요.");
  const random = seededRandom(seed);
  const vehicles = Array.from({ length: count }, (_, i) => {
    let arrivalTime: number, departureRequest: number;
    if (type === "office") {
      const shift = i % 2;
      arrivalTime = shift * 110 + Math.floor(random() * 35);
      departureRequest = shift * 110 + 75 + Math.floor(random() * 15);
    } else if (type === "cinema") {
      const show = i % 3;
      arrivalTime = show * 75 + Math.floor(random() * 30);
      departureRequest = show * 75 + 60 + Math.floor(random() * 3);
    } else {
      arrivalTime = Math.floor(random() * 210);
      departureRequest = arrivalTime + 10 + Math.floor(random() * 45);
    }
    const estimatedDeparture = Math.max(
      arrivalTime + 1,
      departureRequest + Math.round((random() * 2 - 1) * uncertainty),
    );
    return {
      vehicleId: `CAR-${String(i + 1).padStart(3, "0")}`,
      arrivalTime,
      duration: departureRequest - arrivalTime,
      departureRequest,
      estimatedDeparture,
    };
  }).sort((a, b) => a.arrivalTime - b.arrivalTime);
  return {
    id: type,
    title: labels[type][0]!,
    description: labels[type][1]!,
    seed,
    observationEnd: 280,
    layout: createLayout(),
    vehicles,
  };
}
