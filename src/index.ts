import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadVehiclesCsv } from "./csv.js";
import { simulateParking, type SimulationResult } from "./simulation.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultCsvPath = path.resolve(currentDirectory, "../data/vehicles.csv");

function printResult(result: SimulationResult): void {
  console.log("=== 주차장 시뮬레이션 결과 ===");
  console.log(`총 차량 수: ${result.totalVehicles}대`);
  console.log(`평균 이동거리: ${result.averageDistance.toFixed(2)}`);
  console.log(`평균 점유율: ${result.averageOccupancyRate.toFixed(2)}%`);
  console.log("");
  console.log("차량별 배정 주차면");

  for (const assignment of result.assignments) {
    if (assignment.spotId === null) {
      console.log(
        `- ${assignment.vehicleId}: 도착 ${assignment.arrivalTime}, 미배정(만차)`,
      );
      continue;
    }

    console.log(
      `- ${assignment.vehicleId}: 도착 ${assignment.arrivalTime}, ` +
        `출차 ${assignment.departureTime}, ${assignment.spotId}번 주차면`,
    );
  }
}

async function main(): Promise<void> {
  const csvPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : defaultCsvPath;
  const vehicles = await loadVehiclesCsv(csvPath);
  printResult(simulateParking(vehicles));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`오류: ${message}`);
  process.exitCode = 1;
});
