import { createLayout } from "./layout.js";
import { seededRandom } from "./strategies.js";
import {
  validateSnapshot,
  type AirportSnapshot,
  type FloorId,
} from "../data/incheon.js";
import type { Scenario } from "./model.js";
export function createAirportScenario(
  snapshot: AirportSnapshot,
  floorId: FloorId = "ground",
  seed = 42,
  count = 110,
  uncertainty = 6,
): Scenario {
  validateSnapshot(snapshot);
  if (
    !Number.isSafeInteger(seed) ||
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > 500 ||
    !Number.isFinite(uncertainty) ||
    uncertainty < 0 ||
    uncertainty > 100
  )
    throw new Error("공항 실험 설정이 유효하지 않습니다.");
  const floor = snapshot.floors.find((f) => f.id === floorId);
  if (!floor) throw new Error("지원하지 않는 층입니다.");
  const random = seededRandom(seed),
    layout = createLayout(20);
  // Official diagram: H/A on the terminal side, C/D behind, west/east pairs.
  // Coordinates below are a reduced conceptual layout, not surveyed geometry.
  layout.nodes = layout.nodes.map((node) => ({
    ...node,
    x: node.x >= 11 ? node.x + 2 : node.x,
  }));
  layout.spots = layout.spots.map((spot) => {
    const row = Math.floor((spot.id - 1) / 20),
      column = (spot.id - 1) % 20;
    return {
      ...spot,
      zone: (floorId === "b2" ? 0 : row < 2 ? 0 : 2) + (column < 10 ? 1 : 2),
    };
  });
  layout.edges = layout.edges.map((edge) => {
    const from = layout.nodes.find((n) => n.id === edge.from)!,
      to = layout.nodes.find((n) => n.id === edge.to)!;
    const ticks = from.x === to.x ? 3 : Math.round(Math.abs(to.x - from.x));
    return { ...edge, ticks, capacity: ticks, headway: 1 };
  });
  const shuffled = [...layout.spots]
    .map((spot) => ({ spot, order: random() }))
    .sort((a, b) => a.order - b.order);
  const occupied = Math.round(
    (layout.spots.length * floor.occupancyPercent) / 100,
  );
  const initialParked = shuffled.slice(0, occupied).map(({ spot }, i) => {
    const departureRequest = 18 + Math.floor(random() * 190);
    return {
      vehicleId: `ICN-PARKED-${String(i + 1).padStart(3, "0")}`,
      spotId: spot.id,
      departureRequest,
      estimatedDeparture: Math.max(
        1,
        departureRequest + Math.round((random() * 2 - 1) * uncertainty),
      ),
    };
  });
  const vehicles = Array.from({ length: count }, (_, i) => {
    const arrivalTime = Math.floor(random() * 230);
    const duration = 25 + Math.floor(random() * 130);
    const departureRequest = arrivalTime + duration;
    return {
      vehicleId: `ICN-${String(i + 1).padStart(3, "0")}`,
      arrivalTime,
      duration,
      departureRequest,
      estimatedDeparture: Math.max(
        arrivalTime + 1,
        departureRequest + Math.round((random() * 2 - 1) * uncertainty),
      ),
    };
  }).sort((a, b) => a.arrivalTime - b.arrivalTime);
  return {
    layoutFamily: "airport",
    id: "incheon",
    title: `인천공항 T1 · ${floor.name}`,
    description:
      "공식 점유율로 초기화한 80면 축소 모델 · 이후 차량 흐름은 합성",
    seed,
    observationEnd: 400,
    layout,
    vehicles,
    initialParked,
    provenance: {
      sourceUrl: snapshot.sourceUrl,
      updatedAt: snapshot.updatedAt,
      fetchedAt: snapshot.fetchedAt,
      floor: floor.name,
      available: floor.available,
      occupancyPercent: floor.occupancyPercent,
      modelCapacity: 80,
      zones: floorId === "b2" ? ["H", "A"] : ["H", "A", "C", "D"],
      geometry:
        "공식 안내의 H/A·C/D 상대 배치(지하2층은 H/A)를 반영한 80면 개념 모델. 정밀 도면이나 실제 좌표가 아님.",
      demand:
        "초기 점유율만 관측값. 점유 면 위치·잔여 체류시간·후속 입출차는 seeded 합성.",
    },
  };
}
