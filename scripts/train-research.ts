import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parsePolicy } from "../src/rl/dqn.js";
import { trainPolicy } from "../src/research/training.js";
import {
  FAMILIES,
  FEATURE_MODES,
  LEARNING_SEEDS,
  TEST_SEEDS,
  NOISE_LEVELS,
  demandLevels,
} from "../src/research/config.js";
import { compareValidation, OBJECTIVE_VERSION } from "../src/twin/objective.js";
import { validateSnapshot } from "../src/data/incheon.js";
const episodes = Number(process.argv[2] ?? 200);
if (!Number.isSafeInteger(episodes) || episodes < 1 || episodes > 10000)
  throw new Error("episode 수가 유효하지 않습니다.");
const snapshot = validateSnapshot(
  JSON.parse(await readFile("public/data/incheon-t1.json", "utf8")),
);
await mkdir("experiments/v0.4/policies", { recursive: true });
await mkdir("public/research/training", { recursive: true });
const entries = [];
for (const family of FAMILIES) {
  let bestPolicy: Awaited<ReturnType<typeof trainPolicy>>["policy"] | null =
    null;
  for (const featureMode of FEATURE_MODES)
    for (const seed of LEARNING_SEEDS) {
      const id = `${family}-${featureMode}-${seed}`;
      console.log(`START ${id}`);
      let cached: Awaited<ReturnType<typeof trainPolicy>> | null = null;
      if (process.argv.includes("--resume"))
        try {
          const saved = parsePolicy(
            JSON.parse(
              await readFile(`experiments/v0.4/policies/${id}.json`, "utf8"),
            ),
          );
          const log = JSON.parse(
            await readFile(`public/research/training/${id}.json`, "utf8"),
          );
          if (
            saved.training.episodes === episodes &&
            saved.training.seed === seed &&
            saved.environment === family &&
            saved.featureMode === featureMode &&
            log.schemaVersion === 2 &&
            log.objective === OBJECTIVE_VERSION &&
            log.history?.length === episodes &&
            JSON.stringify(log.snapshot) === JSON.stringify(snapshot)
          )
            cached = { policy: saved, log };
        } catch {}
      const result =
        cached ??
        (await trainPolicy({
          family,
          featureMode,
          seed,
          episodes,
          snapshot,
          onProgress: (row) => console.log(JSON.stringify({ id, ...row })),
        }));
      const text = JSON.stringify(result.policy) + "\n",
        sha256 = createHash("sha256").update(text).digest("hex");
      await writeFile(`experiments/v0.4/policies/${id}.json`, text);
      await writeFile(
        `public/research/training/${id}.json`,
        JSON.stringify(result.log) + "\n",
      );
      entries.push({
        id,
        family,
        featureMode,
        seed,
        episodes,
        sha256,
        policyPath: `experiments/v0.4/policies/${id}.json`,
        logUrl: `research/training/${id}.json`,
        validationRejectionRate: result.policy.training.validationRejectionRate,
        validationOperatingPerVehicle:
          result.policy.training.validationOperatingPerVehicle,
      });
      if (
        featureMode === "full" &&
        (!bestPolicy ||
          compareValidation(
            {
              rejectionRate: result.policy.training.validationRejectionRate,
              operatingPerVehicle:
                result.policy.training.validationOperatingPerVehicle,
            },
            {
              rejectionRate: bestPolicy.training.validationRejectionRate,
              operatingPerVehicle:
                bestPolicy.training.validationOperatingPerVehicle,
            },
          ) < 0)
      )
        bestPolicy = result.policy;
    }
  const suffix = family === "standard" ? "" : `-${family}`;
  await writeFile(
    `public/policy${suffix}.json`,
    JSON.stringify(bestPolicy) + "\n",
  );
}
const manifest = {
  schemaVersion: 2,
  objective: OBJECTIVE_VERSION,
  episodes,
  learningSeeds: LEARNING_SEEDS,
  testSeeds: TEST_SEEDS,
  noiseLevels: NOISE_LEVELS,
  demandLevels: Object.fromEntries(FAMILIES.map((f) => [f, demandLevels(f)])),
  snapshot,
  selection:
    "Validation only. Every learning seed is retained and evaluated; no selection on final tests.",
  entries,
};
await writeFile(
  "public/research/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
await writeFile(
  "experiments/v0.4/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("ALL TRAINING COMPLETE");
