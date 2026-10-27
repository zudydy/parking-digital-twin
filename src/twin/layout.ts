import type { Edge, Layout } from "./model.js";

export function createLayout(): Layout {
  const nodes: Layout["nodes"] = [
    { id: "entry", x: 0, y: 0 },
    { id: "exit", x: 6, y: 5 },
  ];
  const edges: Edge[] = [];
  const spots: Layout["spots"] = [];
  const connect = (from: string, to: string) =>
    edges.push({ id: `${from}>${to}`, from, to, ticks: 1, capacity: 1 });
  for (let row = 1; row <= 4; row++) {
    for (let x = 0; x <= 6; x++) nodes.push({ id: `n${row}-${x}`, x, y: row });
    connect(row === 1 ? "entry" : `n${row - 1}-0`, `n${row}-0`);
    for (let x = 1; x <= 6; x++) connect(`n${row}-${x - 1}`, `n${row}-${x}`);
    if (row > 1) connect(`n${row - 1}-6`, `n${row}-6`);
    for (let x = 1; x <= 5; x++)
      spots.push({ id: (row - 1) * 5 + x, node: `n${row}-${x}`, zone: row });
  }
  connect("n4-6", "exit");
  return { nodes, edges, spots, entrance: "entry", exit: "exit" };
}

export function shortestPath(layout: Layout, from: string, to: string): Edge[] {
  const distances = new Map<string, number>([[from, 0]]);
  const paths = new Map<string, Edge[]>([[from, []]]);
  const pending = new Set(layout.nodes.map((n) => n.id));
  while (pending.size) {
    let current: string | undefined;
    let best = Infinity;
    for (const id of pending)
      if ((distances.get(id) ?? Infinity) < best) {
        current = id;
        best = distances.get(id)!;
      }
    if (current === undefined) break;
    if (current === to) return paths.get(current)!;
    pending.delete(current);
    for (const edge of layout.edges.filter((e) => e.from === current)) {
      const distance = best + edge.ticks;
      if (distance < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, distance);
        paths.set(edge.to, [...paths.get(current)!, edge]);
      }
    }
  }
  throw new Error(`경로가 없습니다: ${from} → ${to}`);
}

export const routeLength = (edges: Edge[]) =>
  edges.reduce((sum, edge) => sum + edge.ticks, 0);
