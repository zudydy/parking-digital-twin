import { readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parsePolicy } from "../src/rl/dqn.js";
import { compareValidation } from "../src/twin/objective.js";
import { FAMILIES, FEATURE_MODES } from "../src/research/config.js";
const manifest = JSON.parse(
  await readFile("experiments/v0.4/manifest.json", "utf8"),
);
const published: Record<string, { id: string; sha256: string }> = {};
for (const family of FAMILIES)
  for (const mode of FEATURE_MODES) {
    const candidates = await Promise.all(
      manifest.entries
        .filter((e: any) => e.family === family && e.featureMode === mode)
        .map(async (e: any) => {
          const raw = await readFile(e.policyPath, "utf8");
          if (createHash("sha256").update(raw).digest("hex") !== e.sha256)
            throw new Error("정책 해시가 다릅니다.");
          return { entry: e, policy: parsePolicy(JSON.parse(raw)) };
        }),
    );
    candidates.sort((a, b) =>
      compareValidation(
        {
          rejectionRate: a.policy.training.validationRejectionRate,
          operatingPerVehicle: a.policy.training.validationOperatingPerVehicle,
        },
        {
          rejectionRate: b.policy.training.validationRejectionRate,
          operatingPerVehicle: b.policy.training.validationOperatingPerVehicle,
        },
      ),
    );
    const best = candidates[0]!;
    const filename = `policy${family === "standard" ? "" : `-${family}`}${mode === "full" ? "" : "-no-departure"}.json`;
    await copyFile(best.entry.policyPath, `public/${filename}`);
    published[filename] = { id: best.entry.id, sha256: best.entry.sha256 };
  }
await writeFile(
  "public/research/published.json",
  JSON.stringify(
    {
      selection: "validation only; test results never used",
      policies: published,
    },
    null,
    2,
  ) + "\n",
);
console.log(published);
