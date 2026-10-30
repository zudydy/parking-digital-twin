import { withSearchCirculation } from "../twin/search.js";
import type { AirportSnapshot, FloorId } from "../data/incheon.js";
import { createAirportScenario } from "../twin/airport.js";
import {
  createScenario,
  scenarioTypes,
  type ScenarioType,
} from "../twin/scenarios.js";
import { createAsymmetricScenario } from "../twin/variants.js";
export const FAMILIES = ["standard", "airport", "asymmetric"] as const;
export type Family = (typeof FAMILIES)[number];
export const FEATURE_MODES = ["full", "no-departure"] as const;
export type FeatureMode = (typeof FEATURE_MODES)[number];
export const LEARNING_SEEDS = [11, 23, 47];
export const NOISE_LEVELS = [0, 6, 20];
export const TEST_SEEDS = Array.from({ length: 30 }, (_, i) => 90001 + i);
export const VAL_SEEDS = [50001, 50002, 50003];
export const familyCases = (family: Family): string[] =>
  family === "airport" ? ["ground", "b1", "b2"] : [...scenarioTypes];
export const demandLevels = (family: Family) =>
  family === "airport" ? [100, 180, 260] : [35, 70, 110];
export const networkShape = (family: Family) =>
  family === "airport"
    ? { inputs: 403, hidden: 48, actions: 80 }
    : { inputs: 103, hidden: 32, actions: 20 };
export function makeResearchScenario(
  family: Family,
  kind: string,
  seed: number,
  count: number,
  noise: number,
  snapshot: AirportSnapshot,
) {
  return withSearchCirculation(
    family === "airport"
      ? createAirportScenario(snapshot, kind as FloorId, seed, count, noise)
      : family === "asymmetric"
        ? createAsymmetricScenario(kind as ScenarioType, seed, count, noise)
        : createScenario(kind as ScenarioType, seed, count, noise),
  );
}
