import type { Frame, Trip, TwinResult } from "../twin/model.js";
export const worldPoint = (x: number, y: number) => ({ x: x * 3.2, z: y * 10 });
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const t = clamp(v);
  return t * t * (3 - 2 * t);
};
const mixAngle = (a: number, b: number, t: number) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
function curve(
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
  d: { x: number; z: number },
  t: number,
) {
  const k = 1 - t;
  return {
    x: k ** 3 * a.x + 3 * k * k * t * b.x + 3 * k * t * t * c.x + t ** 3 * d.x,
    z: k ** 3 * a.z + 3 * k * k * t * b.z + 3 * k * t * t * c.z + t ** 3 * d.z,
  };
}
export function vehiclePose(
  result: TwinResult,
  trip: Trip,
  frame: Frame,
  time: number,
) {
  const state = frame.vehicles.find((v) => v.vehicleId === trip.vehicleId);
  if (!state) return null;
  const layout = result.scenario.layout;
  const spot = layout.spots.find((s) => s.id === trip.spotId);
  const node = spot
    ? layout.nodes.find((n) => n.id === spot.node)!
    : { x: state.x, y: state.y };
  const bay = worldPoint(node.x, node.y);
  bay.z += 3.4;
  const parkingStart = trip.parkedAt === null ? Infinity : trip.parkedAt - 1;
  if (!trip.initial && time >= parkingStart && time < trip.parkedAt!) {
    const p = clamp(time - parkingStart),
      road = worldPoint(node.x, node.y);
    const position = curve(
      road,
      { x: road.x + 1, z: road.z },
      { x: bay.x, z: bay.z - 1.5 },
      bay,
      p,
    );
    return {
      ...position,
      heading: (-Math.PI / 2) * smooth(p),
      waiting: false,
      parked: false,
    };
  }
  if (
    trip.parkedAt !== null &&
    time >= trip.parkedAt &&
    (trip.leftSpotAt === null || time < trip.leftSpotAt)
  )
    return {
      ...bay,
      heading: -Math.PI / 2,
      waiting: state.waiting,
      parked: true,
    };
  const index = trip.segments.findIndex((s) => time >= s.start && time < s.end);
  const segment = trip.segments[index];
  if (segment) {
    const edge = layout.edges.find((e) => e.id === segment.edgeId)!;
    const from = layout.nodes.find((n) => n.id === edge.from)!,
      to = layout.nodes.find((n) => n.id === edge.to)!;
    const a = worldPoint(from.x, from.y),
      b = worldPoint(to.x, to.y);
    const p = clamp((time - segment.start) / (segment.end - segment.start));
    const heading = -Math.atan2(b.z - a.z, b.x - a.x);
    if (segment.direction === "outbound" && segment.start === trip.leftSpotAt) {
      const position = curve(
        bay,
        { x: bay.x, z: a.z + 0.8 },
        { x: b.x - 1, z: b.z },
        b,
        p,
      );
      return {
        ...position,
        heading: mixAngle(-Math.PI / 2, heading, smooth(p)),
        waiting: false,
        parked: false,
      };
    }
    const previous = trip.segments[index - 1];
    let startHeading = heading;
    if (previous && previous.end === segment.start) {
      const previousEdge = layout.edges.find((e) => e.id === previous.edgeId)!;
      const n = layout.nodes.find((n) => n.id === previousEdge.from)!;
      startHeading = -Math.atan2(from.y - n.y, from.x - n.x);
    }
    return {
      x: a.x + (b.x - a.x) * p,
      z: a.z + (b.z - a.z) * p,
      heading: mixAngle(startHeading, heading, smooth(p / 0.35)),
      waiting: false,
      parked: false,
    };
  }
  const last = [...trip.segments].reverse().find((s) => s.end <= time);
  let heading = 0;
  if (last) {
    const edge = layout.edges.find((e) => e.id === last.edgeId)!;
    const a = layout.nodes.find((n) => n.id === edge.from)!,
      b = layout.nodes.find((n) => n.id === edge.to)!;
    heading = -Math.atan2(b.y - a.y, b.x - a.x);
  } else heading = -Math.PI / 2;
  return {
    ...worldPoint(state.x, state.y),
    heading,
    waiting: state.waiting,
    parked: false,
  };
}
