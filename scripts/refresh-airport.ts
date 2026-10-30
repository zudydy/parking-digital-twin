import { mkdir, writeFile } from "node:fs/promises";
import { fetchAirport } from "../server/airport.js";
await mkdir("public/data", { recursive: true });
const data = await fetchAirport();
await writeFile("public/data/incheon-t1.json", data + "\n");
console.log(data);
