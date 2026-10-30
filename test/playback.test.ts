import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { advanceTime, frameAt } from "../src/ui/presentation.js";
import { simulateTwin } from "../src/twin/engine.js";
import { createScenario } from "../src/twin/scenarios.js";
import { baseline } from "../src/twin/strategies.js";

describe("재생 시간 경계", () => {
  it("첫 RAF timestamp가 effect 생성보다 빨라도 음수 시간으로 진행하지 않는다", () => {
    assert.equal(advanceTime(0, -1.5, 1, 200), 0);
    assert.equal(advanceTime(0, NaN, 1, 200), 0);
    assert.equal(advanceTime(10, 35000, 1, 200), 10 + 100 / 350);
    assert.equal(advanceTime(199.9, 100, 8, 200), 200);
  });
  it("음수·NaN·종료 후 시간 탐색에서도 유효한 프레임을 반환한다", () => {
    const result = simulateTwin(
      createScenario("mall", 42, 5),
      baseline("nearest"),
    );
    assert.equal(frameAt(result, -0.01), result.frames[0]);
    assert.equal(frameAt(result, NaN), result.frames[0]);
    assert.equal(
      frameAt(result, result.metrics.endTime + 100),
      result.frames.at(-1),
    );
  });
});
