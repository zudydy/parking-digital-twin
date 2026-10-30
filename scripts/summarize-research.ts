import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { mean, crossedPairedCI } from "../src/research/statistics.js";
import {
  FAMILIES,
  TEST_SEEDS,
  LEARNING_SEEDS,
} from "../src/research/config.js";
const csv = gunzipSync(await readFile("public/research/runs.csv.gz"))
    .toString()
    .trim()
    .split("\n"),
  headers = csv.shift()!.split(",");
const rows = csv.map((line) =>
  Object.fromEntries(line.split(",").map((v, i) => [headers[i]!, v])),
);
const summaries = [];
for (const family of FAMILIES)
  for (const strategy of [
    "nearest",
    "random",
    "rule",
    "trained",
    "no-departure",
    "untrained",
  ]) {
    const group = rows.filter(
      (r) => r.family === family && r.strategy === strategy,
    );
    const metrics = Object.fromEntries(
      ["rejectionRate", "operatingPerVehicle"].map((key) => [
        key,
        mean(group.map((r) => Number(r[key]))),
      ]),
    );
    const differences = (reference: string, key: string) => {
      const learning = ["nearest", "random", "rule"].includes(strategy)
        ? [-1]
        : LEARNING_SEEDS;
      const referenceMap = new Map(
        rows
          .filter((r) => r.family === family && r.strategy === reference)
          .map((r) => [
            [r.kind, r.count, r.noise, r.trafficSeed, r.learningSeed].join("|"),
            r,
          ]),
      );
      const matrix = learning.map((seed) =>
        TEST_SEEDS.map((traffic) =>
          mean(
            group
              .filter(
                (r) =>
                  Number(r.learningSeed) === seed &&
                  Number(r.trafficSeed) === traffic,
              )
              .map(
                (r) =>
                  Number(r[key]) -
                  Number(
                    referenceMap.get(
                      [
                        r.kind,
                        r.count,
                        r.noise,
                        r.trafficSeed,
                        reference === "nearest" ? -1 : seed,
                      ].join("|"),
                    )![key],
                  ),
              ),
          ),
        ),
      );
      return { mean: mean(matrix.flat()), ci95: crossedPairedCI(matrix) };
    };
    summaries.push({
      family,
      strategy,
      conditions: 81,
      metrics,
      pairedVsNearest: Object.fromEntries(
        ["rejectionRate", "operatingPerVehicle"].map((k) => [
          k,
          differences("nearest", k),
        ]),
      ),
      ...(strategy === "trained"
        ? {
            fullMinusNoDeparture: Object.fromEntries(
              ["rejectionRate", "operatingPerVehicle"].map((k) => [
                k,
                differences("no-departure", k),
              ]),
            ),
          }
        : {}),
    });
  }
const result = {
  schemaVersion: 1,
  objective: "service-first-v2",
  aggregation:
    "Equal weight over the 81 fixed design conditions per family; bootstrap learner × shared traffic after averaging conditions. No population inference over layouts or demand types.",
  summaries,
};
await writeFile(
  "public/research/overall.json",
  JSON.stringify(result, null, 2) + "\n",
);
await writeFile(
  "experiments/v0.4/overall.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(summaries.filter((s) => s.strategy === "trained"));
