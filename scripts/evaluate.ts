import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { simulateTwin } from "../src/twin/engine.js";
import { createScenario, scenarioTypes } from "../src/twin/scenarios.js";
import { baseline } from "../src/twin/strategies.js";
import { parsePolicy, rlStrategy } from "../src/rl/dqn.js";
import type { Metrics } from "../src/twin/model.js";
const raw = await readFile("public/policy.json", "utf8");
const policy = parsePolicy(JSON.parse(raw));
const repetitions = Number(process.argv[2] ?? 30);
if (!Number.isSafeInteger(repetitions) || repetitions < 2 || repetitions > 1000)
  throw new Error("평가 반복 수는 2~1,000이어야 합니다.");
const rows: ({
  scenario: string;
  strategy: string;
  seed: number;
  inputHash: string;
} & Metrics)[] = [];
for (const type of scenarioTypes)
  for (let index = 0; index < repetitions; index++) {
    const seed = 90001 + index;
    if (
      (seed >= policy.training.trainingSeeds[0] &&
        seed <= policy.training.trainingSeeds[1]) ||
      policy.training.validationSeeds.includes(seed)
    )
      throw new Error("평가 seed가 학습 또는 검증 seed와 겹칩니다.");
    const scenario = createScenario(type, seed);
    const inputHash = createHash("sha256")
      .update(JSON.stringify(scenario))
      .digest("hex");
    for (const id of ["nearest", "random", "rule", "rl"] as const) {
      const result = simulateTwin(
        scenario,
        id === "rl" ? rlStrategy(policy) : baseline(id, seed),
        false,
      );
      rows.push({
        scenario: type,
        strategy: id,
        seed,
        inputHash,
        ...result.metrics,
      });
    }
  }
const keys = [
  "cost",
  "averageParkingTime",
  "averageExitTime",
  "averageDistance",
  "totalDelay",
  "rejectionRate",
  "averageOccupancyRate",
  "peakQueue",
] as const;
const summary = scenarioTypes.flatMap((scenario) =>
  ["nearest", "random", "rule", "rl"].map((strategy) => {
    const group = rows.filter(
      (row) => row.scenario === scenario && row.strategy === strategy,
    );
    const metrics = Object.fromEntries(
      keys.map((key) => {
        const values = group.map((row) => row[key]);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const std = Math.sqrt(
          values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
            (values.length - 1),
        );
        return [key, { mean, std }];
      }),
    );
    const pairedCost = group.map(
      (row) =>
        row.cost -
        rows.find(
          (r) =>
            r.scenario === scenario &&
            r.strategy === "nearest" &&
            r.seed === row.seed,
        )!.cost,
    );
    return {
      scenario,
      strategy,
      repetitions,
      metrics,
      pairedCostDeltaVsNearest:
        pairedCost.reduce((a, b) => a + b, 0) / pairedCost.length,
    };
  }),
);
await mkdir("experiments", { recursive: true });
await writeFile(
  "experiments/evaluation.json",
  JSON.stringify(
    {
      policySha256: createHash("sha256").update(raw).digest("hex"),
      evaluationSeeds: [90001, 90000 + repetitions],
      vehicleCount: 70,
      uncertainty: 6,
      observationEnd: 280,
      summary,
      rows,
    },
    null,
    2,
  ) + "\n",
);
const headers = Object.keys(rows[0]!) as (keyof (typeof rows)[number])[];
await writeFile(
  "experiments/evaluation.csv",
  [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => row[key]).join(",")),
  ].join("\n") + "\n",
);
for (const item of summary)
  console.log(
    `${item.scenario.padEnd(7)} ${item.strategy.padEnd(7)} cost=${item.metrics.cost!.mean.toFixed(1)} ±${item.metrics.cost!.std.toFixed(1)} delay=${item.metrics.totalDelay!.mean.toFixed(1)} rejection=${item.metrics.rejectionRate!.mean.toFixed(1)}%`,
  );
