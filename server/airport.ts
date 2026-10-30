import { parseAirportHtml, AIRPORT_URL } from "../src/data/incheon.js";
import type { IncomingMessage, ServerResponse } from "node:http";
let cache: { at: number; body: string } | undefined;
let pending: Promise<string> | undefined;
export async function fetchAirport() {
  if (cache && Date.now() - cache.at < 60000) return cache.body;
  if (!pending)
    pending = (async () => {
      const response = await fetch(AIRPORT_URL, {
        signal: AbortSignal.timeout(10000),
        headers: {
          "User-Agent": "ParkingTwin-Research/0.3 (+local graduation project)",
        },
      });
      if (!response.ok)
        throw new Error("공식 주차 현황 서버가 응답하지 않습니다.");
      const body = JSON.stringify(parseAirportHtml(await response.text()));
      cache = { at: Date.now(), body };
      return body;
    })().finally(() => {
      pending = undefined;
    });
  return pending;
}
export function airportMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) {
  if (req.url?.split("?")[0] !== "/api/incheon") return next();
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end();
    return;
  }
  void fetchAirport()
    .then((body) => {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(body);
    })
    .catch(() => {
      res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          error:
            "공식 현황을 갱신하지 못했습니다. 저장된 스냅샷은 계속 사용할 수 있습니다.",
        }),
      );
    });
}
