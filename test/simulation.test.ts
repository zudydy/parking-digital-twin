import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseVehiclesCsv } from "../src/csv.js";
import { simulateParking, type Vehicle } from "../src/simulation.js";

describe("Nearest 주차 시뮬레이션", () => {
  it("가장 가까운 빈 주차면과 동거리의 낮은 번호를 선택한다", () => {
    const result = simulateParking([
      { vehicleId: "A", arrivalTime: 0, duration: 10 },
      { vehicleId: "B", arrivalTime: 0, duration: 10 },
    ]);

    assert.deepEqual(
      result.assignments.map((assignment) => assignment.spotId),
      [1, 2],
    );
  });

  it("같은 시각의 출차를 먼저 처리해 주차면을 재사용한다", () => {
    const result = simulateParking([
      { vehicleId: "A", arrivalTime: 0, duration: 5 },
      { vehicleId: "B", arrivalTime: 5, duration: 2 },
    ]);

    assert.deepEqual(
      result.assignments.map((assignment) => assignment.spotId),
      [1, 1],
    );
  });

  it("같은 도착 시각에는 입력 순서를 유지한다", () => {
    const result = simulateParking([
      { vehicleId: "B", arrivalTime: 3, duration: 2 },
      { vehicleId: "A", arrivalTime: 3, duration: 2 },
    ]);

    assert.deepEqual(
      result.assignments.map((assignment) => assignment.vehicleId),
      ["B", "A"],
    );
  });

  it("만차 이후 도착 차량을 미배정 처리한다", () => {
    const vehicles: Vehicle[] = Array.from({ length: 21 }, (_, index) => ({
      vehicleId: `CAR-${index + 1}`,
      arrivalTime: 0,
      duration: 10,
    }));
    const result = simulateParking(vehicles);

    assert.equal(result.assignments[19]?.spotId, 20);
    assert.equal(result.assignments[20]?.spotId, null);
    assert.equal(result.assignments[20]?.departureTime, null);
  });

  it("평균 이동거리와 시간가중 평균 점유율을 계산한다", () => {
    const result = simulateParking([
      { vehicleId: "A", arrivalTime: 0, duration: 10 },
      { vehicleId: "B", arrivalTime: 0, duration: 10 },
    ]);

    assert.equal(result.averageDistance, 2.5);
    assert.equal(result.averageOccupancyRate, 10);
  });

  it("차량이 없으면 모든 지표가 0이다", () => {
    assert.deepEqual(simulateParking([]), {
      totalVehicles: 0,
      averageDistance: 0,
      averageOccupancyRate: 0,
      assignments: [],
    });
  });
});

describe("CSV 입력 검증", () => {
  it("정상 CSV를 파싱한다", () => {
    assert.deepEqual(
      parseVehiclesCsv("vehicleId,arrivalTime,duration\nA,0,3\n"),
      [{ vehicleId: "A", arrivalTime: 0, duration: 3 }],
    );
  });

  const invalidCases: Array<[string, string, RegExp]> = [
    ["빈 CSV", "", /1행/],
    ["잘못된 헤더", "id,arrival,duration\nA,0,1", /1행/],
    ["데이터 없음", "vehicleId,arrivalTime,duration\n", /2행/],
    ["중복 ID", "vehicleId,arrivalTime,duration\nA,0,1\nA,1,1", /3행.*중복/],
    [
      "잘못된 숫자",
      "vehicleId,arrivalTime,duration\nA,x,1",
      /2행.*arrivalTime/,
    ],
    [
      "음수 도착 시각",
      "vehicleId,arrivalTime,duration\nA,-1,1",
      /2행.*arrivalTime/,
    ],
    ["0인 주차 시간", "vehicleId,arrivalTime,duration\nA,0,0", /2행.*duration/],
  ];

  for (const [name, csv, expectedMessage] of invalidCases) {
    it(`${name}을 거부하고 행 번호를 알린다`, () => {
      assert.throws(() => parseVehiclesCsv(csv), expectedMessage);
    });
  }
});
