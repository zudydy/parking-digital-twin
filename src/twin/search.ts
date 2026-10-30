import type { Edge, Scenario } from "./model.js";
import { shortestPath } from "./layout.js";
export const SEARCH_MODEL = "local-systematic-v1";
/** Same physical return loop for every strategy; no changes to shortest guided routes. */
export function withSearchCirculation(scenario: Scenario): Scenario {
  if (scenario.layout.nodes.some((n) => n.id === "search-south-east"))
    return scenario;
  const layout = structuredClone(scenario.layout);
  const exit = layout.nodes.find((n) => n.id === layout.exit)!;
  const entry = layout.nodes.find((n) => n.id === layout.entrance)!;
  const rowEnd = layout.nodes.find(
    (n) =>
      n.x === exit.x &&
      n.y ===
        Math.max(
          ...layout.spots.map(
            (s) => layout.nodes.find((n) => n.id === s.node)!.y,
          ),
        ),
  )!;
  if (!rowEnd) throw new Error("순환 탐색을 지원하는 주차장 도로가 아닙니다.");
  const verticalTicks = layout.edges.find(
    (e) => e.from === rowEnd.id && e.to === layout.exit,
  )!.ticks;
  const nodes = [
    { id: "search-south-east", x: exit.x, y: 5.7 },
    { id: "search-south-west", x: -2, y: 5.7 },
    { id: "search-north-west", x: -2, y: entry.y },
  ];
  layout.nodes.push(...nodes);
  const add = (from: string, to: string, ticks: number) =>
    layout.edges.push({
      id: `${from}>${to}`,
      from,
      to,
      ticks,
      capacity: ticks,
      headway: 1,
    });
  add(rowEnd.id, nodes[0]!.id, Math.ceil((5.7 - rowEnd.y) * verticalTicks));
  add(nodes[0]!.id, nodes[1]!.id, Math.ceil(exit.x + 2));
  add(nodes[1]!.id, nodes[2]!.id, Math.ceil((5.7 - entry.y) * verticalTicks));
  add(nodes[2]!.id, layout.entrance, 2);
  return { ...scenario, layout };
}
/** A driver sweeps one entire aisle, then circulates to the next; occupancy is never consulted here. */
export function searchCircuits(scenario: Scenario): Edge[][] {
  const layout = scenario.layout;
  const rows = new Map<number, typeof layout.spots>();
  for (const spot of layout.spots) {
    const y = layout.nodes.find((n) => n.id === spot.node)!.y;
    const row = rows.get(y) ?? [];
    row.push(spot);
    rows.set(y, row);
  }
  return [...rows]
    .sort((a, b) => a[0] - b[0])
    .map(([, spots]) => {
      const last = [...spots]
        .sort(
          (a, b) =>
            layout.nodes.find((n) => n.id === a.node)!.x -
            layout.nodes.find((n) => n.id === b.node)!.x,
        )
        .at(-1)!;
      return [
        ...shortestPath(layout, layout.entrance, last.node),
        ...shortestPath(layout, last.node, "search-south-east"),
        ...shortestPath(layout, "search-south-east", layout.entrance),
      ];
    });
}
export function startingAisle(seed: number, vehicleId: string, rows: number) {
  let hash = (seed ^ 2166136261) >>> 0;
  for (const c of vehicleId)
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  return hash % rows;
}
