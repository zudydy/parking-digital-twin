import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  availableActions,
  encode,
  QNetwork,
  parsePolicy,
  INPUTS,
} from "../src/rl/dqn.js";
import { TwinEnvironment } from "../src/twin/engine.js";
import { createScenario } from "../src/twin/scenarios.js";

describe("DQN 학습과 추론", () => {
  it("가중치 업데이트로 terminal target 오차가 감소한다", () => {
    const network = new QNetwork(3),
      target = new QNetwork(3);
    const state = Array(INPUTS).fill(0.2);
    const transition = {
      state,
      action: 2,
      reward: -2,
      next: null,
      available: [],
    };
    const before = Math.abs(network.forward(state).q[2]! + 2);
    for (let i = 0; i < 100; i++)
      network.train([transition], target, 0.98, 0.0003);
    assert.ok(Math.abs(network.forward(state).q[2]! + 2) < before / 3);
    assert.deepEqual(
      new QNetwork(1, network.weights).forward(state),
      network.forward(state),
    );
    assert.notDeepEqual(target.weights, network.weights);
  });
  it("더 높은 Q값의 행동이 마스킹되면 사용하지 않는다", () => {
    const network = new QNetwork(2);
    network.weights.b2[19] = 1000;
    assert.equal(
      network.action(Array(INPUTS).fill(0), [1, 2]),
      network.forward(Array(INPUTS).fill(0)).q[1]! >=
        network.forward(Array(INPUTS).fill(0)).q[2]!
        ? 1
        : 2,
    );
    assert.throws(() => parsePolicy({}), /정책/);
  });
  it("bootstrap target도 사용 불가 행동의 Q값을 제외한다", () => {
    const network = new QNetwork(1),
      target = new QNetwork(2);
    for (const model of [network, target])
      for (const key of ["w1", "b1", "w2", "b2"] as const)
        model.weights[key].fill(0);
    target.weights.b2[19] = 1000;
    const state = Array(INPUTS).fill(0);
    const loss = network.train(
      [{ state, action: 0, reward: 0, next: state, available: [1] }],
      target,
      0.98,
      0.0003,
    );
    assert.equal(loss, 0);
    assert.equal(network.forward(state).q[0], 0);
  });
  it("환경 관찰과 행동 인코딩이 끝까지 유효하다", () => {
    const environment = new TwinEnvironment(
      createScenario("cinema", 333),
      false,
    );
    const network = new QNetwork(5);
    while (!environment.done) {
      const observation = environment.observation()!;
      assert.equal(encode(observation).length, INPUTS);
      const action = network.action(
        encode(observation),
        availableActions(observation),
      );
      environment.step(observation.candidates[action]!.spotId);
    }
    assert.ok(Number.isFinite(environment.cost));
  });
});
