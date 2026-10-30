import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  FAMILIES,
  familyCases,
  demandLevels,
  makeResearchScenario,
  TEST_SEEDS,
} from "../src/research/config.js";
import { simulateTwin } from "../src/twin/engine.js";
import { baseline } from "../src/twin/strategies.js";
import { mean, crossedPairedCI } from "../src/research/statistics.js";
const manifest = JSON.parse(
  await readFile("experiments/v0.4/manifest.json", "utf8"),
);
const rows = [];
const summaries = [];
for (const family of FAMILIES)
  for (const kind of familyCases(family))
    for (const order of ["distributed", "sequential"] as const) {
      const group: Record<string, string | number>[] = [];
      for (const seed of TEST_SEEDS) {
        const s = {
          ...makeResearchScenario(
            family,
            kind,
            seed,
            demandLevels(family)[1]!,
            6,
            manifest.snapshot,
          ),
          searchOrder: order,
        };
        const search = simulateTwin(s, baseline("search"), false),
          guide = simulateTwin(s, baseline("nearest"), false);
        const old = new Map(
          search.trips
            .filter((t) => !t.initial && t.parkedAt !== null)
            .map((t) => [t.vehicleId, t]),
        );
        const matched = guide.trips.filter(
          (t) => !t.initial && t.parkedAt !== null && old.has(t.vehicleId),
        );
        const row = {
          family,
          kind,
          order,
          seed,
          count: s.vehicles.length,
          noise: 6,
          inputHash: createHash("sha256")
            .update(JSON.stringify(s))
            .digest("hex"),
          searchParking: search.metrics.averageParkingTime,
          guidedParking: guide.metrics.averageParkingTime,
          searchRejection: search.metrics.rejectionRate,
          guidedRejection: guide.metrics.rejectionRate,
          matchedCount: matched.length,
          matchedParkingDelta: mean(
            matched.map((t) => t.parkedAt! - old.get(t.vehicleId)!.parkedAt!),
          ),
          matchedDistanceDelta: mean(
            matched.map((t) => t.distance - old.get(t.vehicleId)!.distance),
          ),
          rejectionDelta:
            guide.metrics.rejectionRate - search.metrics.rejectionRate,
          searchFailures: search.metrics.searchFailures,
        };
        group.push(row);
        rows.push(row);
      }
      summaries.push({
        family,
        kind,
        order,
        count: demandLevels(family)[1],
        noise: 6,
        metrics: Object.fromEntries(
          ["matchedParkingDelta", "matchedDistanceDelta", "rejectionDelta"].map(
            (key) => {
              const values = group.map(
                (r) => r[key as keyof typeof r] as number,
              );
              return [
                key,
                { mean: mean(values), ci95: crossedPairedCI([values]) },
              ];
            },
          ),
        ),
      });
    }
await mkdir("experiments/v0.5", { recursive: true });
const report = {
  schemaVersion: 1,
  model: "local-systematic-v1",
  runs: rows.length * 2,
  design:
    "medium demand and noise 6 only; 3 families × 3 kinds × 2 search orders × 30 traffic seeds × 2 strategies; exploratory paired traffic bootstrap 2000",
  summaries,
  rows,
};
await writeFile(
  "public/research/search-sensitivity.json",
  JSON.stringify(report) + "\n",
);
await writeFile(
  "experiments/v0.5/search-sensitivity.json",
  JSON.stringify(report) + "\n",
);
console.log(`Search-order sensitivity: ${report.runs} runs`);
