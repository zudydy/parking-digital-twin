import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TwinEnvironment, simulateTwin } from "../src/twin/engine.js";
import { createLayout, shortestPath } from "../src/twin/layout.js";
import { createScenario, scenarioTypes } from "../src/twin/scenarios.js";
import { baseline } from "../src/twin/strategies.js";
import type { Scenario } from "../src/twin/model.js";
const single = (): Scenario => ({
  id: "test",
  title: "test",
  description: "",
  seed: 1,
  observationEnd: 30,
  layout: createLayout(),
  vehicles: [
    { vehicleId: "A", arrivalTime: 0, duration: 3, estimatedDeparture: 6 },
  ],
});

describe("통로 기반 디지털 트윈", () => {
  it("단일 차량의 이동·체류·출차와 관측 구간 점유율을 정확하게 계산한다", () => {
    const result = simulateTwin(single(), baseline("nearest"));
    const trip = result.trips[0]!;
    assert.equal(trip.parkedAt, 3); // entry→row1→spot1 + parking tick
    assert.equal(trip.departureRequestedAt, 6);
    assert.equal(trip.leftSpotAt, 6);
    assert.equal(trip.exitedAt, 15); // 5 horizontal + 4 exit spine
    assert.equal(result.metrics.averageParkingTime, 3);
    assert.equal(result.metrics.averageExitTime, 9);
    assert.equal(result.metrics.averageDistance, 11);
    assert.equal(result.metrics.totalDelay, 0);
    assert.equal(result.metrics.cost, 12);
    assert.equal(result.metrics.averageOccupancyRate, (3 / (20 * 30)) * 100);
    assert.equal(result.frames.at(-1)?.vehicles.length, 0);
  });
  it("동시 입차는 통로 용량을 넘지 않고 실제 대기를 발생시킨다", () => {
    const scenario = single();
    scenario.vehicles.push({ ...scenario.vehicles[0]!, vehicleId: "B" });
    const result = simulateTwin(scenario, baseline("nearest"));
    assert.ok(result.metrics.totalDelay > 0);
    for (const frame of result.frames)
      for (const edge of frame.edges) assert.ok(edge.moving <= 1);
    assert.equal(result.trips[1]!.parkedAt, 5);
  });
  it("이동 중 주차면도 예약하여 만차 차량을 거부한다", () => {
    const scenario = single();
    scenario.vehicles = Array.from({ length: 21 }, (_, i) => ({
      vehicleId: String(i),
      arrivalTime: 0,
      duration: 30,
      estimatedDeparture: 50,
    }));
    const result = simulateTwin(scenario, baseline("nearest"));
    assert.equal(result.metrics.rejected, 1);
    assert.equal(
      new Set(
        result.trips.filter((t) => t.spotId !== null).map((t) => t.spotId),
      ).size,
      20,
    );
  });
  it("관찰값에 실제 출차시간이나 미래 수요를 노출하지 않는다", () => {
    const scenario = single();
    const left = new TwinEnvironment(scenario, false);
    scenario.vehicles[0]!.departureRequest = 25;
    const right = new TwinEnvironment(scenario, false);
    assert.deepEqual(left.observation(), right.observation());
    assert.throws(() => left.step(99), /사용 불가/);
  });
  it("모든 수요·전략에서 재현되며 주차면과 통로 사용 구간이 겹치지 않는다", () => {
    for (const type of scenarioTypes)
      for (const strategy of ["nearest", "random", "rule"] as const) {
        const scenario = createScenario(type, 90);
        const result = simulateTwin(scenario, baseline(strategy, 90));
        assert.deepEqual(
          result,
          simulateTwin(scenario, baseline(strategy, 90)),
        );
        assert.equal(result.trips.length, scenario.vehicles.length);
        assert.ok(
          result.trips.every((t) => t.spotId === null || t.exitedAt !== null),
        );
        for (const spot of scenario.layout.spots) {
          const trips = result.trips
            .filter((t) => t.spotId === spot.id)
            .sort((a, b) => a.arrivalTime - b.arrivalTime);
          for (let i = 1; i < trips.length; i++)
            assert.ok(trips[i - 1]!.leftSpotAt! <= trips[i]!.arrivalTime);
        }
        for (const edge of scenario.layout.edges) {
          const uses = result.trips
            .flatMap((t) => t.segments.filter((s) => s.edgeId === edge.id))
            .sort((a, b) => a.start - b.start);
          for (let i = 1; i < uses.length; i++)
            assert.ok(uses[i - 1]!.end <= uses[i]!.start);
        }
      }
  });
  it("빈 입력과 잘못된 입력을 처리한다", () => {
    const scenario = single();
    scenario.vehicles = [];
    assert.equal(
      simulateTwin(scenario, baseline("nearest")).metrics.averageDistance,
      0,
    );
    scenario.vehicles = [
      { vehicleId: "A", arrivalTime: -1, duration: 1, estimatedDeparture: 1 },
    ];
    assert.throws(() => new TwinEnvironment(scenario), /차량/);
    assert.throws(() => shortestPath(createLayout(), "exit", "entry"), /경로/);
  });
});
