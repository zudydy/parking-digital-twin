import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { serviceScore, compareValidation } from "../src/twin/objective.js";
import { simulateTwin } from "../src/twin/engine.js";
import { baseline } from "../src/twin/strategies.js";
import { createScenario } from "../src/twin/scenarios.js";
import { createAsymmetricScenario } from "../src/twin/variants.js";
import { shortestPath, routeLength } from "../src/twin/layout.js";
import { agentObservation, encode } from "../src/rl/dqn.js";
describe("서비스 우선 목적과 일정 지연", () => {
  it("미배정 한 대가 운영비용의 어떤 차이보다 우선한다", () => {
    assert.ok(serviceScore(0, 1e12, 1) < serviceScore(1, 0, 1));
    assert.ok(serviceScore(3, 1e12, 100) < serviceScore(4, 0, 100));
    assert.ok(serviceScore(0, 20, 10) < serviceScore(0, 30, 10));
    assert.ok(
      compareValidation(
        { rejectionRate: 1, operatingPerVehicle: 999 },
        { rejectionRate: 2, operatingPerVehicle: 0 },
      ) < 0,
    );
  });
  it("원래 출차 요청을 보존하고 물리적 출차·일정 지연을 분리한다", () => {
    const scenario = createScenario("mall", 1, 1);
    scenario.vehicles = [
      {
        vehicleId: "A",
        arrivalTime: 0,
        duration: 1,
        departureRequest: 1,
        estimatedDeparture: 1,
      },
    ];
    const result = simulateTwin(scenario, baseline("nearest"));
    assert.equal(result.trips[0]!.departureRequestedAt, 1);
    assert.equal(result.trips[0]!.departureReadyAt, 4);
    assert.equal(result.metrics.averageExitTime, 9);
    assert.equal(result.metrics.averageScheduledExitTime, 12);
    assert.equal(result.metrics.averageScheduleDelay, 3);
    assert.equal(result.metrics.lateDepartureVehicles, 1);
    assert.equal(result.metrics.operatingCost, 15);
  });
  it("추가 출구가 모든 주차면에서 도달 가능하지 않아도 유효한 출구를 사용한다", () => {
    const s = createAsymmetricScenario("mall", 2, 35),
      r = simulateTwin(s, baseline("nearest"));
    assert.ok(r.trips.every((t) => t.spotId === null || t.exitedAt !== null));
    const fullTrip = (spot: number) => {
      const node = s.layout.spots.find((p) => p.id === spot)!.node;
      const distances = s.layout.exits!.flatMap((exit) => {
        try {
          return [routeLength(shortestPath(s.layout, node, exit))];
        } catch {
          return [];
        }
      });
      return (
        routeLength(shortestPath(s.layout, s.layout.entrance, node)) +
        Math.min(...distances)
      );
    };
    assert.equal(fullTrip(1), 8);
    assert.equal(fullTrip(6), 11);
  });
  it("출차정보 제외 관찰은 실제 예상치 변경에 대해 동일한 입력을 준다", () => {
    const r = simulateTwin(createScenario("mall", 3, 5), baseline("nearest"));
    const obs = r.decisions[0]!.observation;
    const other = {
      ...obs,
      estimatedDeparture: obs.estimatedDeparture + 999,
      candidates: obs.candidates.map((c) => ({ ...c, departurePressure: 99 })),
    };
    assert.deepEqual(
      encode(obs, 20, "no-departure"),
      encode(other, 20, "no-departure"),
    );
    assert.equal(
      agentObservation(obs, "no-departure").candidates[0]!.departurePressure,
      0,
    );
  });
});
