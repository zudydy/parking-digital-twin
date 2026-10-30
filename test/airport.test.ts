import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseAirportHtml, validateSnapshot } from "../src/data/incheon.js";
import { createAirportScenario } from "../src/twin/airport.js";
import { simulateTwin } from "../src/twin/engine.js";
import { baseline } from "../src/twin/strategies.js";
import { parsePolicy, rlStrategy } from "../src/rl/dqn.js";
import { vehiclePose, worldPoint } from "../src/ui/motion.js";
const snapshot = validateSnapshot(
  JSON.parse(readFileSync("data/sources/incheon-t1-fixture.json", "utf8")),
);
describe("인천공항 관측 데이터와 축소 시뮬레이션", () => {
  it("실제 공식 페이지 발췌에서 층별 잔여면과 점유율·시각을 추출한다", () => {
    const parsed = parseAirportHtml(
      readFileSync("data/sources/incheon-t1-excerpt.html", "utf8"),
      snapshot.fetchedAt,
    );
    assert.deepEqual(parsed, snapshot);
    assert.throws(() => parseAirportHtml("<html/>"), /시각/);
    assert.throws(
      () =>
        validateSnapshot({
          ...snapshot,
          floors: snapshot.floors.map((f) => ({ ...f, occupancyPercent: 101 })),
        }),
      /수치/,
    );
  });
  it("80면 모델의 초기 점유를 공식 점유율에 맞추고 후속 수요와 구분한다", () => {
    const scenario = createAirportScenario(snapshot, "ground", 100, 35);
    const result = simulateTwin(scenario, baseline("nearest"));
    const initial = Math.round(snapshot.floors[0]!.occupancyPercent * 0.8);
    assert.equal(scenario.layout.spots.length, 80);
    assert.equal(result.frames[0]!.occupied.length, initial);
    assert.equal(
      result.frames[0]!.arrived,
      scenario.vehicles.filter((v) => v.arrivalTime === 0).length,
    );
    assert.equal(result.metrics.totalVehicles, 35);
    const expectedCost = result.trips.reduce(
      (sum, t) =>
        sum +
        t.distance +
        t.waitingTicks +
        (t.spotId === null ? 0 : t.initial ? 0 : 1) +
        (t.spotId === null
          ? 0
          : (t.departureReadyAt ?? 0) - (t.departureRequestedAt ?? 0)),
      0,
    );
    assert.equal(result.metrics.operatingCost, expectedCost);
    assert.equal(result.trips.filter((t) => t.initial).length, initial);
    assert.ok(
      result.trips.every((t) => t.spotId === null || t.exitedAt !== null),
    );
    assert.deepEqual(
      scenario,
      createAirportScenario(snapshot, "ground", 100, 35),
    );
    assert.equal(
      result.scenario.provenance!.available,
      snapshot.floors[0]!.available,
    );
  });
  it("80면 전용 정책을 사용하고 20면 정책을 잘못 연결하면 거부한다", () => {
    const scenario = createAirportScenario(snapshot, "b1", 90002, 35);
    const policy = parsePolicy(
      JSON.parse(readFileSync("public/policy-airport.json", "utf8")),
    );
    const result = simulateTwin(scenario, rlStrategy(policy), false);
    assert.equal(result.metrics.totalVehicles, 35);
    const expectedCost = result.trips.reduce(
      (sum, t) =>
        sum +
        t.distance +
        t.waitingTicks +
        (t.spotId === null ? 0 : t.initial ? 0 : 1) +
        (t.spotId === null
          ? 0
          : (t.departureReadyAt ?? 0) - (t.departureRequestedAt ?? 0)),
      0,
    );
    assert.equal(result.metrics.operatingCost, expectedCost);
    const old = parsePolicy(
      JSON.parse(readFileSync("public/policy.json", "utf8")),
    );
    assert.throws(
      () => simulateTwin(scenario, rlStrategy(old), false),
      /행동 수/,
    );
  });
  it("긴 통로의 동시 수용량과 진입 간격을 지키며 차량을 순차 이동시킨다", () => {
    const scenario = createAirportScenario(snapshot, "ground", 9090, 80);
    const result = simulateTwin(scenario, baseline("nearest"));
    for (const edge of scenario.layout.edges) {
      const uses = result.trips
        .flatMap((t) => t.segments.filter((s) => s.edgeId === edge.id))
        .sort((a, b) => a.start - b.start);
      for (let i = 1; i < uses.length; i++)
        assert.ok(uses[i]!.start - uses[i - 1]!.start >= (edge.headway ?? 0));
      for (const frame of result.frames)
        assert.ok(
          frame.edges.find((e) => e.edgeId === edge.id)!.moving <=
            edge.capacity,
        );
    }
    assert.ok(result.frames.some((f) => f.edges.some((e) => e.moving > 1)));
  });
  it("입차·주차·출차 보간의 위치가 연속이고 모든 자세가 유한하다", () => {
    const scenario = createAirportScenario(snapshot, "ground", 300, 10);
    const result = simulateTwin(scenario, baseline("nearest"));
    for (const trip of result.trips.filter(
      (t) => !t.initial && t.spotId !== null,
    )) {
      const spot = scenario.layout.spots.find((s) => s.id === trip.spotId)!;
      const node = scenario.layout.nodes.find((n) => n.id === spot.node)!;
      const bay = worldPoint(node.x, node.y);
      bay.z += 3.4;
      for (const t of [
        trip.parkedAt! - 0.001,
        trip.parkedAt!,
        trip.leftSpotAt!,
        trip.leftSpotAt! + 0.001,
      ]) {
        const pose = vehiclePose(
          result,
          trip,
          result.frames[Math.floor(t)]!,
          t,
        )!;
        assert.ok(
          Number.isFinite(pose.heading) &&
            Number.isFinite(pose.x) &&
            Number.isFinite(pose.z),
        );
        assert.ok(Math.hypot(pose.x - bay.x, pose.z - bay.z) < 0.02);
      }
    }
  });
});
