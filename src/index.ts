import { withSearchCirculation } from "./twin/search.js";
import { createAsymmetricScenario } from "./twin/variants.js";
import { createAirportScenario } from "./twin/airport.js";
import { validateSnapshot, type FloorId } from "./data/incheon.js";
import path from "node:path";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { simulateTwin } from "./twin/engine.js";
import {
  createScenario,
  scenarioTypes,
  type ScenarioType,
} from "./twin/scenarios.js";
import { baseline } from "./twin/strategies.js";
import { scenarioFromCsv } from "./twin/input.js";
import { parsePolicy, rlStrategy } from "./rl/dqn.js";

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "search-order": { type: "string", default: "distributed" },
      floor: { type: "string", default: "ground" },
      scenario: { type: "string", default: "cinema" },
      strategy: { type: "string", default: "search" },
      seed: { type: "string", default: "42" },
      count: { type: "string", default: "70" },
      uncertainty: { type: "string", default: "6" },
      output: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(
      "pnpm start -- [vehicles.csv] [--scenario office|cinema|mall|incheon|asymmetric] [--floor ground|b1|b2] [--strategy search|nearest|random|rule|rl] [--seed 42] [--count 70] [--uncertainty 6] [--output result.json]",
    );
    return;
  }
  if (positionals.length > 1) throw new Error("CSV 경로는 하나만 지정하세요.");
  if (
    values.scenario !== "incheon" &&
    values.scenario !== "asymmetric" &&
    !scenarioTypes.includes(values.scenario as ScenarioType)
  )
    throw new Error(
      "지원하는 시나리오: office, cinema, mall, incheon, asymmetric",
    );
  if (!["search", "nearest", "random", "rule", "rl"].includes(values.strategy!))
    throw new Error("지원하는 전략: search, nearest, random, rule, rl");
  const seed = Number(values.seed);
  if (!Number.isSafeInteger(seed)) throw new Error("seed는 정수여야 합니다.");
  if (!["ground", "b1", "b2"].includes(values.floor!))
    throw new Error("층은 ground, b1, b2 중 선택하세요.");
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  if (!["distributed", "sequential"].includes(values["search-order"]!))
    throw new Error("탐색 순서: distributed, sequential");
  const inputScenario = positionals[0]
    ? scenarioFromCsv(
        await readFile(path.resolve(positionals[0]), "utf8"),
        path.basename(positionals[0]),
        seed,
      )
    : values.scenario === "incheon"
      ? createAirportScenario(
          validateSnapshot(
            JSON.parse(
              await readFile(
                path.join(root, "public/data/incheon-t1.json"),
                "utf8",
              ),
            ),
          ),
          values.floor as FloorId,
          seed,
          Number(values.count),
          Number(values.uncertainty),
        )
      : values.scenario === "asymmetric"
        ? createAsymmetricScenario(
            "cinema",
            seed,
            Number(values.count),
            Number(values.uncertainty),
          )
        : createScenario(
            values.scenario as ScenarioType,
            seed,
            Number(values.count),
            Number(values.uncertainty),
          );
  const scenario = withSearchCirculation({
    ...inputScenario,
    searchOrder: values["search-order"] as "distributed" | "sequential",
  });
  const strategy =
    values.strategy === "rl"
      ? rlStrategy(
          parsePolicy(
            JSON.parse(
              await readFile(
                path.join(
                  root,
                  scenario.layout.spots.length === 80
                    ? "public/policy-airport.json"
                    : scenario.layoutFamily === "asymmetric"
                      ? "public/policy-asymmetric.json"
                      : "public/policy.json",
                ),
                "utf8",
              ),
            ),
          ),
        )
      : baseline(
          values.strategy as "search" | "nearest" | "random" | "rule",
          seed,
        );
  const result = simulateTwin(scenario, strategy, false),
    m = result.metrics;
  console.log(`=== ${scenario.title} / ${strategy.id} / seed ${seed} ===`);
  console.log(
    `총 ${m.totalVehicles}대 · 배정 ${m.assigned}대 · 미배정 ${m.rejected}대 (${m.rejectionRate.toFixed(2)}%)`,
  );
  console.log(
    `평균 주차 ${m.averageParkingTime.toFixed(2)} tick · 평균 출차 ${m.averageExitTime.toFixed(2)} tick`,
  );
  console.log(
    `평균 총 이동거리 ${m.averageDistance.toFixed(2)} · 누적 지연 ${m.totalDelay} tick`,
  );
  console.log(
    `시간가중 점유율 ${m.averageOccupancyRate.toFixed(2)}% · 운영비용 ${m.operatingCost} tick · 서비스 우선 점수 ${m.cost.toFixed(6)}`,
  );
  if (values.output) {
    const output = path.resolve(values.output);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(
      output,
      JSON.stringify(
        { schemaVersion: 3, input: scenario, ...result },
        null,
        2,
      ) + "\n",
    );
    console.log(`결과 저장: ${output}`);
  }
}
main().catch((error: unknown) => {
  console.error(
    `오류: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
