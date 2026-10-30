import { readFile } from "node:fs/promises";
import type { Vehicle } from "./simulation.js";
import { parseVehiclesCsv } from "./vehicles-csv.js";
export { parseVehiclesCsv } from "./vehicles-csv.js";
export async function loadVehiclesCsv(path: string): Promise<Vehicle[]> {
  return parseVehiclesCsv(await readFile(path, "utf8"));
}
