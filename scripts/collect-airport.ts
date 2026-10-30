import { mkdir, writeFile } from "node:fs/promises";
import { fetchAirport } from "../server/airport.js";
import { readHistory } from "../server/history.js";
const count = Number(process.argv[2] ?? 8),
  interval = Number(process.argv[3] ?? 60000);
if (
  !Number.isSafeInteger(count) ||
  count < 1 ||
  count > 1440 ||
  !Number.isFinite(interval) ||
  interval < 60000
)
  throw new Error("수집 횟수 1~1440, 간격 60,000ms 이상을 지정하세요.");
for (let index = 0; index < count; index++) {
  try {
    const s = JSON.parse(await fetchAirport());
    console.log(
      JSON.stringify({
        sample: index + 1,
        updatedAt: s.updatedAt,
        floors: s.floors,
      }),
    );
  } catch (e) {
    console.error(`수집 실패: ${String(e)}`);
  }
  const history = await readHistory();
  await mkdir("public/data", { recursive: true });
  await writeFile(
    "public/data/incheon-history.json",
    JSON.stringify({ schemaVersion: 1, history }, null, 2) + "\n",
  );
  if (index < count - 1)
    await new Promise((resolve) => setTimeout(resolve, interval));
}
