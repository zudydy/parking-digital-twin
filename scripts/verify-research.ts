import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { simulateTwin } from "../src/twin/engine.js";
import { baseline } from "../src/twin/strategies.js";
import {
  parsePolicy,
  rlStrategy,
  QNetwork,
  encode,
  availableActions,
} from "../src/rl/dqn.js";
import {
  FAMILIES,
  familyCases,
  demandLevels,
  makeResearchScenario,
} from "../src/research/config.js";
const report = JSON.parse(
  await readFile("public/research/analysis.json", "utf8"),
);
const manifest = report.manifest;
const csv = gunzipSync(await readFile("public/research/runs.csv.gz"))
  .toString()
  .trim()
  .split("\n");
const headers = csv.shift()!.split(",");
const rows = csv.map((line) =>
  Object.fromEntries(line.split(",").map((v, i) => [headers[i]!, v])),
);
assert.equal(rows.length, 31590);
assert.equal(report.runs, rows.length);
assert.equal(report.summaries.length, 567);
const groups = new Map<string, typeof rows>();
for (const row of rows) {
  const key = [
    row.family,
    row.kind,
    row.count,
    row.noise,
    row.trafficSeed,
  ].join("|");
  const group = groups.get(key) ?? [];
  group.push(row);
  groups.set(key, group);
}
assert.equal(groups.size, 2430);
for (const group of groups.values()) {
  assert.equal(group.length, 13);
  assert.equal(new Set(group.map((r) => r.inputHash)).size, 1);
}
const policies = new Map();
for (const entry of manifest.entries) {
  const raw = await readFile(entry.policyPath, "utf8");
  assert.equal(createHash("sha256").update(raw).digest("hex"), entry.sha256);
  policies.set(entry.id, parsePolicy(JSON.parse(raw)));
}
let checked = 0;
for (const family of FAMILIES)
  for (const kind of familyCases(family))
    for (const seed of [90001, 90015, 90030]) {
      const count = demandLevels(family)[1]!;
      const scenario = makeResearchScenario(
        family,
        kind,
        seed,
        count,
        6,
        manifest.snapshot,
      );
      const hash = createHash("sha256")
        .update(JSON.stringify(scenario))
        .digest("hex");
      const group = groups.get([family, kind, count, 6, seed].join("|"))!;
      for (const row of group) {
        assert.equal(row.inputHash, hash);
        let allocation;
        if (["search", "nearest", "random", "rule"].includes(row.strategy!))
          allocation = baseline(
            row.strategy as "search" | "nearest" | "random" | "rule",
            seed,
          );
        else if (row.strategy === "untrained") {
          const entry = manifest.entries.find(
            (e: any) => e.id === row.policyId!.slice(5),
          );
          const policy = policies.get(entry.id)!;
          const net = new QNetwork(
            Number(row.learningSeed),
            undefined,
            policy.network,
          );
          allocation = {
            id: "untrained",
            choose(obs: Parameters<typeof encode>[0]) {
              return obs.candidates[
                net.action(encode(obs, net.actions), availableActions(obs))
              ]!.spotId;
            },
          };
        } else allocation = rlStrategy(policies.get(row.policyId)!);
        const result = simulateTwin(scenario, allocation, false);
        const metrics = result.metrics;
        const search = simulateTwin(scenario, baseline("search"), false);
        const byId = new Map(
          search.trips
            .filter((t) => !t.initial && t.parkedAt !== null)
            .map((t) => [t.vehicleId, t]),
        );
        const matched = result.trips.filter(
          (t) => !t.initial && t.parkedAt !== null && byId.has(t.vehicleId),
        );
        assert.equal(matched.length, Number(row.matchedCount));
        const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
        assert.ok(
          Math.abs(
            mean(
              matched.map(
                (t) =>
                  t.parkedAt! -
                  t.arrivalTime -
                  (byId.get(t.vehicleId)!.parkedAt! - t.arrivalTime),
              ),
            ) - Number(row.matchedParkingDelta),
          ) < 1e-8,
        );
        assert.ok(
          Math.abs(
            mean(
              matched.map((t) => t.distance - byId.get(t.vehicleId)!.distance),
            ) - Number(row.matchedDistanceDelta),
          ) < 1e-8,
        );
        for (const [key, value] of Object.entries(metrics))
          assert.ok(
            Math.abs(value - Number(row[key])) < 1e-8,
            `${family}/${kind}/${seed}/${row.strategy}/${key}: ${value} != ${row[key]}`,
          );
        checked++;
      }
    }
console.log(
  `Verified ${rows.length} rows, ${groups.size} paired inputs, 18 policy hashes; independently replayed ${checked} runs.`,
);
