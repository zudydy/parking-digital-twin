import { readFile, mkdir, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { simulateTwin } from "../src/twin/engine.js";
import { baseline } from "../src/twin/strategies.js";
import {
  QNetwork,
  encode,
  availableActions,
  parsePolicy,
  rlStrategy,
} from "../src/rl/dqn.js";
import { OBJECTIVE_VERSION } from "../src/twin/objective.js";
import {
  FAMILIES,
  familyCases,
  demandLevels,
  NOISE_LEVELS,
  TEST_SEEDS,
  makeResearchScenario,
  type Family,
  type FeatureMode,
} from "../src/research/config.js";
import {
  mean,
  sampleStd,
  crossedPairedCI,
} from "../src/research/statistics.js";
import type { Metrics } from "../src/twin/model.js";
const sourceManifest = JSON.parse(
  await readFile("experiments/v0.4/manifest.json", "utf8"),
) as {
  snapshot: Parameters<typeof makeResearchScenario>[5];
  entries: {
    id: string;
    family: Family;
    featureMode: FeatureMode;
    seed: number;
    sha256: string;
    policyPath: string;
  }[];
};
const manifest = {
  ...sourceManifest,
  schemaVersion: 3,
  evaluationModel: "local-systematic-v1",
  comparisonReference: "search",
  searchProtocol: {
    visibility: "current bay only",
    order: "seeded starting aisle, then systematic cyclic sweep",
    maxAisles: 4,
    admission:
      "common on-site vehicle count limited to bay capacity; no remote location info to drivers",
    reservation: "guided: at entrance; search: on local discovery",
    loop: "shared physical perimeter return, no artificial time penalty",
  },
  policyReuse:
    "v0.4 guided policies retained; added positive return cycle leaves all guided paths and observations unchanged",
};
const loaded = await Promise.all(
  manifest.entries.map(async (entry) => {
    const raw = await readFile(entry.policyPath, "utf8");
    if (createHash("sha256").update(raw).digest("hex") !== entry.sha256)
      throw new Error("정책 해시가 다릅니다.");
    return { ...entry, policy: parsePolicy(JSON.parse(raw)) };
  }),
);
const strategies = [
  "search",
  "nearest",
  "random",
  "rule",
  "trained",
  "no-departure",
  "untrained",
] as const;
type Row = Metrics & {
  family: string;
  kind: string;
  count: number;
  noise: number;
  trafficSeed: number;
  learningSeed: number;
  strategy: (typeof strategies)[number];
  policyId: string;
  inputHash: string;
  operatingPerVehicle: number;
  matchedCount: number;
  matchedParkingDelta: number;
  matchedDistanceDelta: number;
};
const rows: Row[] = [],
  summaries: any[] = [];
const metricKeys = [
  "averageSearchTime",
  "averageSearchDistance",
  "averageDetourDistance",
  "searchFailures",
  "entryRejected",
  "admitted",
  "matchedCount",
  "matchedParkingDelta",
  "matchedDistanceDelta",
  "serviceRate",
  "rejectionRate",
  "operatingPerVehicle",
  "operatingCost",
  "averageParkingTime",
  "averageExitTime",
  "averageScheduledExitTime",
  "averageScheduleDelay",
  "averageDistance",
  "totalDelay",
  "averageOccupancyRate",
] as const;
for (const family of FAMILIES)
  for (const kind of familyCases(family))
    for (const count of demandLevels(family))
      for (const noise of NOISE_LEVELS) {
        const condition: Row[] = [];
        for (const trafficSeed of TEST_SEEDS) {
          const scenario = makeResearchScenario(
              family,
              kind,
              trafficSeed,
              count,
              noise,
              manifest.snapshot,
            ),
            inputHash = createHash("sha256")
              .update(JSON.stringify(scenario))
              .digest("hex");
          for (const entry of loaded.filter((e) => e.family === family))
            if (
              (trafficSeed >= entry.policy.training.trainingSeeds[0] &&
                trafficSeed <= entry.policy.training.trainingSeeds[1]) ||
              entry.policy.training.validationSeeds.includes(trafficSeed)
            )
              throw new Error("평가 seed가 학습/검증과 겹칩니다.");
          const searchResult = simulateTwin(
            scenario,
            baseline("search"),
            false,
          );
          const searchTrips = new Map(
            searchResult.trips
              .filter((t) => !t.initial && t.parkedAt !== null)
              .map((t) => [t.vehicleId, t]),
          );
          const run = (
            strategy: Row["strategy"],
            learningSeed: number,
            policyId: string,
            allocation: Parameters<typeof simulateTwin>[1],
          ) => {
            const result =
              strategy === "search"
                ? searchResult
                : simulateTwin(scenario, allocation, false);
            const m = result.metrics;
            const matched = result.trips.filter(
              (t) =>
                !t.initial &&
                t.parkedAt !== null &&
                searchTrips.has(t.vehicleId),
            );
            if (!matched.length)
              throw new Error(
                "공통 주차 성공 차량이 없는 조건은 별도 분석이 필요합니다.",
              );
            condition.push({
              ...m,
              family,
              kind,
              count,
              noise,
              trafficSeed,
              learningSeed,
              strategy,
              policyId,
              inputHash,
              operatingPerVehicle: m.operatingCost / count,
              matchedCount: matched.length,
              matchedParkingDelta: mean(
                matched.map(
                  (t) =>
                    t.parkedAt! -
                    t.arrivalTime -
                    (searchTrips.get(t.vehicleId)!.parkedAt! - t.arrivalTime),
                ),
              ),
              matchedDistanceDelta: mean(
                matched.map(
                  (t) => t.distance - searchTrips.get(t.vehicleId)!.distance,
                ),
              ),
            });
          };
          for (const id of ["search", "nearest", "random", "rule"] as const)
            run(id, -1, "", baseline(id, trafficSeed));
          for (const entry of loaded.filter((e) => e.family === family))
            run(
              entry.featureMode === "full" ? "trained" : "no-departure",
              entry.seed,
              entry.id,
              rlStrategy(entry.policy),
            );
          for (const entry of loaded.filter(
            (e) => e.family === family && e.featureMode === "full",
          )) {
            const net = new QNetwork(
              entry.seed,
              undefined,
              entry.policy.network,
            );
            run("untrained", entry.seed, `init-${entry.id}`, {
              id: "untrained",
              choose(obs) {
                return obs.candidates[
                  net.action(encode(obs, net.actions), availableActions(obs))
                ]!.spotId;
              },
            });
          }
        }
        const baselines = new Map(
          condition
            .filter((r) => r.strategy === "nearest")
            .map((r) => [r.trafficSeed, r]),
        );
        for (const strategy of strategies) {
          const group = condition.filter((r) => r.strategy === strategy),
            learningSeeds = [...new Set(group.map((r) => r.learningSeed))];
          const matrix = (fn: (row: Row) => number) =>
            learningSeeds.map((seed) =>
              TEST_SEEDS.map((traffic) =>
                fn(
                  group.find(
                    (r) => r.learningSeed === seed && r.trafficSeed === traffic,
                  )!,
                ),
              ),
            );
          const metrics = Object.fromEntries(
            metricKeys.map((key) => {
              const byTraffic = TEST_SEEDS.map((seed) =>
                  mean(
                    group
                      .filter((r) => r.trafficSeed === seed)
                      .map((r) => r[key]),
                  ),
                ),
                byLearning = learningSeeds.map((seed) =>
                  mean(
                    group
                      .filter((r) => r.learningSeed === seed)
                      .map((r) => r[key]),
                  ),
                );
              return [
                key,
                {
                  mean: mean(group.map((r) => r[key])),
                  trafficStd: sampleStd(byTraffic),
                  learningStd: sampleStd(byLearning),
                },
              ];
            }),
          );
          const pairedVsNearest = Object.fromEntries(
            ["rejectionRate", "operatingPerVehicle"].map((key) => {
              const paired = matrix(
                (row) =>
                  (row[key as keyof Row] as number) -
                  (baselines.get(row.trafficSeed)![key as keyof Row] as number),
              );
              return [
                key,
                { mean: mean(paired.flat()), ci95: crossedPairedCI(paired) },
              ];
            }),
          );
          const searchBaseline = new Map(
            condition
              .filter((r) => r.strategy === "search")
              .map((r) => [r.trafficSeed, r]),
          );
          const pairedVsSearch = Object.fromEntries(
            [
              "rejectionRate",
              "operatingPerVehicle",
              "averageParkingTime",
              "averageDistance",
              "matchedParkingDelta",
              "matchedDistanceDelta",
            ].map((key) => {
              const paired = matrix(
                (row) =>
                  (row[key as keyof Row] as number) -
                  (searchBaseline.get(row.trafficSeed)![
                    key as keyof Row
                  ] as number),
              );
              return [
                key,
                { mean: mean(paired.flat()), ci95: crossedPairedCI(paired) },
              ];
            }),
          );
          const points = TEST_SEEDS.map((seed) => ({
            seed,
            rejectionRate: mean(
              group
                .filter((r) => r.trafficSeed === seed)
                .map((r) => r.rejectionRate),
            ),
            operatingPerVehicle: mean(
              group
                .filter((r) => r.trafficSeed === seed)
                .map((r) => r.operatingPerVehicle),
            ),
          }));
          const summary: any = {
            family,
            kind,
            count,
            noise,
            strategy,
            learningSeeds,
            trafficSeeds: TEST_SEEDS.length,
            metrics,
            pairedVsNearest,
            pairedVsSearch,
            points,
          };
          if (strategy === "trained")
            summary.fullMinusNoDeparture = Object.fromEntries(
              ["rejectionRate", "operatingPerVehicle"].map((key) => {
                const paired = matrix(
                  (row) =>
                    (row[key as keyof Row] as number) -
                    (condition.find(
                      (r) =>
                        r.strategy === "no-departure" &&
                        r.learningSeed === row.learningSeed &&
                        r.trafficSeed === row.trafficSeed,
                    )![key as keyof Row] as number),
                );
                return [
                  key,
                  { mean: mean(paired.flat()), ci95: crossedPairedCI(paired) },
                ];
              }),
            );
          summaries.push(summary);
        }
        rows.push(...condition);
        console.log(
          JSON.stringify({
            family,
            kind,
            count,
            noise,
            runs: condition.length,
            total: rows.length,
          }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
await mkdir("public/research", { recursive: true });
await mkdir("experiments/v0.5", { recursive: true });
await writeFile(
  "public/research/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  "experiments/v0.5/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
const headers = Object.keys(rows[0]!) as (keyof Row)[];
const csv =
  [
    headers.join(","),
    ...rows.map((row) => headers.map((k) => row[k]).join(",")),
  ].join("\n") + "\n";
const rawPath = "experiments/v0.5/runs.csv.gz";
await writeFile(rawPath, gzipSync(csv, { level: 9 }));
await copyFile(rawPath, "public/research/runs.csv.gz");
const report = {
  schemaVersion: 3,
  objective: OBJECTIVE_VERSION,
  generatedAt: new Date().toISOString(),
  runs: rows.length,
  bootstrap: {
    method: "crossed paired learning-seed × traffic-seed percentile bootstrap",
    iterations: 2000,
    seed: 42,
    learningSeedCount: 3,
    interpretation:
      "exploratory; three learning seeds do not establish broad algorithm superiority",
  },
  manifest,
  summaries,
};
await writeFile("public/research/analysis.json", JSON.stringify(report) + "\n");
await writeFile(
  "experiments/v0.5/analysis.json",
  JSON.stringify(report) + "\n",
);
console.log(
  `EVALUATION COMPLETE ${rows.length} runs; ${summaries.length} summaries`,
);
