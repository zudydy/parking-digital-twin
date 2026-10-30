import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
async function files(dir: string): Promise<string[]> {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
      ),
    )
  ).flat();
}
const paths = [
  ...(await files("src")),
  ...(await files("server")),
  ...(await files("scripts")),
  "package.json",
  "pnpm-lock.yaml",
  "public/data/incheon-t1.json",
  "public/data/incheon-history.json",
  "public/research/analysis.json",
  "public/research/overall.json",
  "public/research/search-sensitivity.json",
  "data/observations/incheon.jsonl",
  "vite.config.ts",
  ...(await files("public/research/training")),
  ...(await files("experiments/v0.4/policies")),
  "public/research/runs.csv.gz",
  "public/research/manifest.json",
  "public/research/published.json",
  ...(await files("public/research/figures")),
].sort();
const hashes = Object.fromEntries(
  await Promise.all(
    paths.map(async (p) => [
      p,
      createHash("sha256")
        .update(await readFile(p))
        .digest("hex"),
    ]),
  ),
);
const body =
  JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      objective: "service-first-v2",
      algorithm: "sha256",
      runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      files: hashes,
    },
    null,
    2,
  ) + "\n";
await writeFile("experiments/v0.5/provenance.json", body);
await writeFile("public/research/provenance.json", body);
console.log(`Recorded ${paths.length} source and result hashes`);
