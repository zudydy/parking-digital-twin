import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
// Vite interprets *.csv.gz as a content-encoded CSV. Downloads must preserve archive bytes.
const archive = fileURLToPath(
  new URL("../public/research/runs.csv.gz", import.meta.url),
);
export function researchDownloadMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) {
  if (req.url?.split("?")[0] !== "/research/runs.csv.gz") return next();
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }
  void readFile(archive)
    .then((bytes) => {
      res.writeHead(200, {
        "Content-Type": "application/gzip",
        "Content-Disposition": 'attachment; filename="parking-runs.csv.gz"',
        "Content-Length": bytes.length,
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : bytes);
    })
    .catch(() => {
      res.writeHead(404);
      res.end();
    });
}
