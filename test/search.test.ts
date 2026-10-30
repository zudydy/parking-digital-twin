import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { simulateTwin, TwinEnvironment } from "../src/twin/engine.js";
import { baseline } from "../src/twin/strategies.js";
import { createScenario } from "../src/twin/scenarios.js";
import { createAirportScenario } from "../src/twin/airport.js";
import { createAsymmetricScenario } from "../src/twin/variants.js";
import { withSearchCirculation } from "../src/twin/search.js";
import { vehiclePose } from "../src/ui/motion.js";
import { encode } from "../src/rl/dqn.js";
const single = () => {
  const s = createScenario("mall", 1, 1);
  s.searchOrder = "sequential";
  s.vehicles = [
    { vehicleId: "A", arrivalTime: 0, duration: 10, estimatedDeparture: 20 },
  ];
  return s;
};
test("empty first bay is found locally without any artificial search penalty", () => {
  const r = simulateTwin(single(), {
    id: "search",
    choose() {
      throw Error("remote allocation must never run");
    },
  });
  const t = r.trips[0]!;
  assert.equal(t.spotId, 1);
  assert.equal(t.spotFoundAt, 2);
  assert.equal(t.parkedAt, 3);
  assert.equal(t.searchDistance, 2);
  assert.equal(r.metrics.averageDetourDistance, 0);
  assert.equal(r.frames[0]!.reserved.length, 0);
  assert.equal(r.frames[1]!.reserved.length, 0);
  assert.deepEqual(r.searchChecks, [
    { vehicleId: "A", time: 2, spotId: 1, available: true },
  ]);
  assert.equal(
    r.metrics.averageParkingTime,
    simulateTwin(single(), baseline("nearest")).metrics.averageParkingTime,
  );
});
test("a full aisle causes actual circulation and a next-aisle sweep with no remote reservation", () => {
  const s = single();
  s.initialParked = s.layout.spots
    .slice(0, 5)
    .map((p) => ({
      vehicleId: `B-${p.id}`,
      spotId: p.id,
      departureRequest: 200,
      estimatedDeparture: 200,
    }));
  const r = simulateTwin(s, baseline("search")),
    t = r.trips.find((t) => t.vehicleId === "A")!;
  assert.equal(t.spotId, 6);
  assert.equal(t.searchLaps, 1);
  assert.ok(t.searchDistance > 20);
  assert.ok(r.metrics.averageDetourDistance > 0);
  assert.deepEqual(
    r.searchChecks.map((c) => c.spotId),
    [1, 2, 3, 4, 5, 6],
  );
  assert.equal(t.segments.filter((s) => s.edgeId === "entry>n1-0").length, 2);
  for (const frame of r.frames.filter((f) => f.time < t.spotFoundAt!))
    assert.ok(!frame.reserved.includes(6));
  assert.ok(t.segments.some((s) => s.edgeId.includes("search-south")));
  const total = r.trips.reduce(
    (sum, t) =>
      sum +
      t.distance +
      (t.initial ? 0 : 1) +
      t.waitingTicks +
      (t.departureReadyAt! - t.departureRequestedAt!),
    0,
  );
  assert.equal(total, r.metrics.operatingCost);
});
test("drivers claim a bay only on arrival, preserve capacity and finish without overlap", () => {
  const s = single();
  s.vehicles = Array.from({ length: 21 }, (_, i) => ({
    vehicleId: `A-${i}`,
    arrivalTime: 0,
    duration: 60,
    estimatedDeparture: 100,
  }));
  const r = simulateTwin(s, baseline("search"));
  assert.equal(r.metrics.entryRejected, 1);
  assert.equal(r.metrics.admitted, 20);
  assert.ok(r.frames.every((f) => f.reserved.length <= 20));
  assert.equal(r.frames[0]!.reserved.length, 0);
  assert.equal(
    r.frames[0]!.vehicles.filter((v) => v.phase === "searching").length,
    20,
  );
  assert.equal(r.frames[0]!.rejected, 1);
  for (const spot of r.scenario.layout.spots) {
    const uses = r.trips
      .filter((t) => t.spotId === spot.id)
      .sort((a, b) => a.spotFoundAt! - b.spotFoundAt!);
    for (let i = 1; i < uses.length; i++)
      assert.ok(uses[i - 1]!.leftSpotAt! <= uses[i]!.spotFoundAt!);
  }
  for (const edge of r.scenario.layout.edges) {
    const uses = r.trips.flatMap((t) =>
      t.segments.filter((s) => s.edgeId === edge.id),
    );
    for (const f of r.frames)
      assert.ok(
        uses.filter((u) => u.start <= f.time && u.end > f.time).length <=
          edge.capacity,
      );
  }
  assert.deepEqual(r, simulateTwin(s, baseline("search")));
});
test("search ignores departure forecasts; gate policy and normal guided behavior stay unchanged", async () => {
  const snapshot = JSON.parse(
    await readFile("public/data/incheon-t1.json", "utf8"),
  );
  for (const s of [
    createScenario("mall", 42, 70),
    createAsymmetricScenario("cinema", 42, 70),
    createAirportScenario(snapshot, "ground", 42, 100),
  ]) {
    const loop = withSearchCirculation(s);
    assert.equal(withSearchCirculation(loop), loop);
    const a = new TwinEnvironment(s, false),
      b = new TwinEnvironment(loop, false);
    while (!a.done) {
      assert.deepEqual(
        encode(a.observation()!, s.layout.spots.length),
        encode(b.observation()!, s.layout.spots.length),
      );
      const spot = baseline("nearest").choose(a.observation()!);
      a.step(spot);
      b.step(spot);
    }
    assert.deepEqual(a.result("nearest").metrics, b.result("nearest").metrics);
  }
  const s = single();
  const r = simulateTwin(s, baseline("search"));
  s.vehicles[0]!.estimatedDeparture = 999;
  const changed = simulateTwin(s, baseline("search"));
  assert.deepEqual(r.searchChecks, changed.searchChecks);
  assert.deepEqual(r.metrics, changed.metrics);
});
test("searching poses are finite, moving and continuous before a space is known", () => {
  const s = single();
  s.initialParked = s.layout.spots
    .slice(0, 5)
    .map((p) => ({
      vehicleId: `B-${p.id}`,
      spotId: p.id,
      departureRequest: 200,
      estimatedDeparture: 200,
    }));
  const r = simulateTwin(s, baseline("search")),
    trip = r.trips.find((t) => t.vehicleId === "A")!;
  let prev: { x: number; z: number } | null = null;
  for (let time = 0; time < trip.exitedAt!; time += 0.2) {
    const pose = vehiclePose(r, trip, r.frames[Math.floor(time)]!, time);
    if (pose) {
      assert.ok([pose.x, pose.z, pose.heading].every(Number.isFinite));
      if (prev) assert.ok(Math.hypot(pose.x - prev.x, pose.z - prev.z) < 12);
      prev = pose;
    }
  }
});
