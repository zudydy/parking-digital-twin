import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeHistory } from "../src/data/history.js";
import type { AirportSnapshot } from "../src/data/incheon.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filename = path.join(root, "data/observations/incheon.jsonl");
export async function readHistory() {
  try {
    const text = await readFile(filename, "utf8");
    return normalizeHistory(
      text
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
export async function recordSnapshot(snapshot: AirportSnapshot) {
  const history = await readHistory();
  if (
    history.some(
      (s) => Date.parse(s.updatedAt) === Date.parse(snapshot.updatedAt),
    )
  )
    return;
  await mkdir(path.dirname(filename), { recursive: true });
  await appendFile(filename, JSON.stringify(snapshot) + "\n");
}
