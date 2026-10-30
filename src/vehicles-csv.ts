import type { Vehicle } from "./simulation.js";

const EXPECTED_HEADER = ["vehicleId", "arrivalTime", "duration"];

export function parseVehiclesCsv(content: string): Vehicle[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);

  if (content.trim() === "") {
    throw new Error("1행: CSV가 비어 있습니다.");
  }

  const header = splitCsvRow(lines[0] ?? "");
  if (
    header.length !== EXPECTED_HEADER.length ||
    !header.every((value, index) => value === EXPECTED_HEADER[index])
  ) {
    throw new Error(
      `1행: 헤더는 ${EXPECTED_HEADER.join(",")} 형식이어야 합니다.`,
    );
  }

  const vehicles: Vehicle[] = [];
  const vehicleIds = new Set<string>();

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim() === "") {
      continue;
    }

    const rowNumber = index + 1;
    const columns = splitCsvRow(line);
    if (columns.length !== EXPECTED_HEADER.length) {
      throw new Error(`${rowNumber}행: 값은 정확히 3개여야 합니다.`);
    }

    const [vehicleId, arrivalText, durationText] = columns;
    if (!vehicleId) {
      throw new Error(`${rowNumber}행: vehicleId가 비어 있습니다.`);
    }
    if (vehicleIds.has(vehicleId)) {
      throw new Error(`${rowNumber}행: 중복된 vehicleId '${vehicleId}'입니다.`);
    }

    const arrivalTime = parseIntegerAtLeast(
      arrivalText,
      "arrivalTime",
      rowNumber,
      0,
    );
    const duration = parseIntegerAtLeast(
      durationText,
      "duration",
      rowNumber,
      1,
    );

    vehicleIds.add(vehicleId);
    vehicles.push({ vehicleId, arrivalTime, duration });
  }

  if (vehicles.length === 0) {
    throw new Error("2행: 차량 데이터가 없습니다.");
  }

  return vehicles;
}

function splitCsvRow(line: string): string[] {
  return line.split(",").map((value) => value.trim());
}

function parseIntegerAtLeast(
  value: string | undefined,
  fieldName: string,
  rowNumber: number,
  minimum: number,
): number {
  if (value === undefined || !/^\d+$/.test(value) || Number(value) < minimum) {
    throw new Error(
      `${rowNumber}행: ${fieldName}은 ${minimum} 이상의 정수여야 합니다.`,
    );
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${rowNumber}행: ${fieldName} 값이 너무 큽니다.`);
  }
  return parsed;
}
