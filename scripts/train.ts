import { readFile, mkdir, writeFile } from "node:fs/promises";
import { trainPolicy } from "../src/research/training.js";
import { validateSnapshot } from "../src/data/incheon.js";
import type { Family } from "../src/research/config.js";
const episodes = Number(process.argv[2] ?? 250),
  seed = Number(process.argv[3] ?? 11),
  family: Family = process.argv.includes("--airport")
    ? "airport"
    : process.argv.includes("--asymmetric")
      ? "asymmetric"
      : "standard";
if (
  !Number.isSafeInteger(episodes) ||
  episodes < 1 ||
  episodes > 10000 ||
  !Number.isSafeInteger(seed)
)
  throw new Error("학습 episode·seed가 유효하지 않습니다.");
const snapshot = validateSnapshot(
  JSON.parse(await readFile("public/data/incheon-t1.json", "utf8")),
);
const { policy, log } = await trainPolicy({
  episodes,
  seed,
  family,
  featureMode: process.argv.includes("--no-departure")
    ? "no-departure"
    : "full",
  snapshot,
  onProgress: (row) => console.log(JSON.stringify({ family, seed, ...row })),
});
const suffix = family === "standard" ? "" : `-${family}`;
await mkdir("experiments/v0.4", { recursive: true });
await writeFile(`public/policy${suffix}.json`, JSON.stringify(policy) + "\n");
await writeFile(
  `experiments/v0.4/training${suffix}.json`,
  JSON.stringify(log, null, 2) + "\n",
);
