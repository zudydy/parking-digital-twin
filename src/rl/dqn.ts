import { OBJECTIVE_VERSION } from "../twin/objective.js";
import type { Observation, Strategy } from "../twin/model.js";
import { seededRandom } from "../twin/strategies.js";

export const ENCODING = "parking-20-v1";
export const INPUTS = 103;
export const HIDDEN = 32;
export const ACTIONS = 20;
export interface Weights {
  w1: number[];
  b1: number[];
  w2: number[];
  b2: number[];
}
export interface PolicyFile {
  version: 2;
  objective: typeof OBJECTIVE_VERSION;
  featureMode: "full" | "no-departure";
  environment: "standard" | "airport" | "asymmetric";
  encoding: typeof ENCODING | "parking-80-v1";
  network?: { inputs: number; hidden: number; actions: number };
  algorithm: "DQN";
  weights: Weights;
  training: {
    episodes: number;
    seed: number;
    gamma: number;
    learningRate: number;
    reward: string;
    trainingSeeds: [number, number];
    validationSeeds: number[];
    selectedEpisode: number;
    validationCost: number;
    validationRejectionRate: number;
    validationOperatingPerVehicle: number;
  };
}
export interface Transition {
  state: number[];
  action: number;
  reward: number;
  next: number[] | null;
  available: number[];
}
const bounded = (n: number) => Math.max(-3, Math.min(3, n));
export function agentObservation(
  observation: Observation,
  featureMode: "full" | "no-departure" = "full",
): Observation {
  return featureMode === "full"
    ? observation
    : {
        ...observation,
        estimatedDeparture: observation.time,
        candidates: observation.candidates.map((c) => ({
          ...c,
          departurePressure: 0,
        })),
      };
}
export function encode(
  observation: Observation,
  actions = ACTIONS,
  featureMode: "full" | "no-departure" = "full",
): number[] {
  observation = agentObservation(observation, featureMode);
  if (
    observation.candidates.length !== actions ||
    observation.candidates.some((c, i) => c.spotId !== i + 1)
  )
    throw new Error("RL 정책과 레이아웃의 행동 수가 다릅니다.");
  return [
    bounded(observation.time / (actions === 80 ? 400 : 280)),
    bounded((observation.estimatedDeparture - observation.time) / 100),
    observation.occupancy,
    ...observation.candidates.flatMap((c) => [
      c.available ? 1 : 0,
      c.inboundDistance / (actions === 80 ? 30 : 10),
      c.outboundDistance / (actions === 80 ? 30 : 10),
      bounded(c.queue / 5),
      bounded(c.departurePressure / 5),
    ]),
  ];
}
export const availableActions = (observation: Observation) =>
  observation.candidates.flatMap((c, i) => (c.available ? [i] : []));

/** Small dense Q network: 103→32 tanh→20. Browser and trainer share inference. */
export class QNetwork {
  weights: Weights;
  readonly inputs: number;
  readonly hidden: number;
  readonly actions: number;
  private square: Weights;
  constructor(
    seed = 1,
    weights?: Weights,
    shape = { inputs: INPUTS, hidden: HIDDEN, actions: ACTIONS },
  ) {
    this.inputs = shape.inputs;
    this.hidden = shape.hidden;
    this.actions = shape.actions;
    const random = seededRandom(seed);
    const init = (size: number, fan: number) =>
      Array.from(
        { length: size },
        () => (random() * 2 - 1) * Math.sqrt(6 / fan),
      );
    this.weights = weights
      ? structuredClone(weights)
      : {
          w1: init(this.inputs * this.hidden, this.inputs + this.hidden),
          b1: Array(this.hidden).fill(0),
          w2: init(this.hidden * this.actions, this.hidden + this.actions),
          b2: Array(this.actions).fill(0),
        };
    this.square = this.zeros();
  }
  private zeros(): Weights {
    return {
      w1: Array(this.inputs * this.hidden).fill(0),
      b1: Array(this.hidden).fill(0),
      w2: Array(this.hidden * this.actions).fill(0),
      b2: Array(this.actions).fill(0),
    };
  }
  forward(state: number[]) {
    if (state.length !== this.inputs)
      throw new Error("잘못된 상태 벡터입니다.");
    const { w1, b1, w2, b2 } = this.weights;
    const hidden = Array<number>(this.hidden);
    for (let j = 0; j < this.hidden; j++) {
      let value = b1[j]!;
      for (let i = 0; i < this.inputs; i++)
        value += state[i]! * w1[j * this.inputs + i]!;
      hidden[j] = Math.tanh(value);
    }
    const q = Array<number>(this.actions);
    for (let a = 0; a < this.actions; a++) {
      let value = b2[a]!;
      for (let j = 0; j < this.hidden; j++)
        value += hidden[j]! * w2[a * this.hidden + j]!;
      q[a] = value;
    }
    return { hidden, q };
  }
  action(state: number[], available: number[]): number {
    if (!available.length) throw new Error("선택 가능한 행동이 없습니다.");
    const { q } = this.forward(state);
    return available.reduce(
      (best, a) => (q[a]! > q[best]! ? a : best),
      available[0]!,
    );
  }
  train(
    batch: Transition[],
    target: QNetwork,
    gamma: number,
    learningRate: number,
  ): number {
    const gradients = this.zeros();
    let loss = 0;
    for (const transition of batch) {
      const { hidden, q } = this.forward(transition.state);
      let expected = transition.reward;
      if (transition.next && transition.available.length) {
        const nextQ = target.forward(transition.next).q;
        expected +=
          gamma * Math.max(...transition.available.map((a) => nextQ[a]!));
      }
      const error = q[transition.action]! - expected;
      loss +=
        Math.abs(error) <= 1 ? (error * error) / 2 : Math.abs(error) - 0.5;
      const derivative = Math.max(-1, Math.min(1, error)) / batch.length;
      gradients.b2[transition.action]! += derivative;
      for (let j = 0; j < this.hidden; j++) {
        const index = transition.action * this.hidden + j;
        gradients.w2[index]! += derivative * hidden[j]!;
        const delta =
          derivative * this.weights.w2[index]! * (1 - hidden[j]! ** 2);
        gradients.b1[j]! += delta;
        for (let i = 0; i < this.inputs; i++)
          gradients.w1[j * this.inputs + i]! += delta * transition.state[i]!;
      }
    }
    for (const key of ["w1", "b1", "w2", "b2"] as const)
      for (let i = 0; i < gradients[key].length; i++) {
        const g = gradients[key][i]!;
        this.square[key][i] = 0.95 * this.square[key][i]! + 0.05 * g * g;
        this.weights[key][i]! -=
          (learningRate * g) / Math.sqrt(this.square[key][i]! + 1e-6);
      }
    return loss / batch.length;
  }
}
export function parsePolicy(value: unknown): PolicyFile {
  const p = value as PolicyFile;
  if (
    !p ||
    p.version !== 2 ||
    p.objective !== OBJECTIVE_VERSION ||
    !["full", "no-departure"].includes(p.featureMode) ||
    !["standard", "airport", "asymmetric"].includes(p.environment) ||
    (p.encoding !== ENCODING && p.encoding !== "parking-80-v1") ||
    p.algorithm !== "DQN" ||
    !p.weights ||
    !p.training ||
    !Number.isSafeInteger(p.training.episodes) ||
    p.training.episodes < 1
  )
    throw new Error("지원하지 않는 RL 정책 파일입니다.");
  const shape = p.network ?? {
    inputs: INPUTS,
    hidden: HIDDEN,
    actions: ACTIONS,
  };
  const expectedActions = p.encoding === ENCODING ? 20 : 80;
  if (
    shape.actions !== expectedActions ||
    shape.inputs !== expectedActions * 5 + 3 ||
    shape.hidden !== (expectedActions === 20 ? 32 : 48)
  )
    throw new Error("RL 신경망 규격이 맞지 않습니다.");
  for (const [key, length] of [
    ["w1", shape.inputs * shape.hidden],
    ["b1", shape.hidden],
    ["w2", shape.hidden * shape.actions],
    ["b2", shape.actions],
  ] as const) {
    if (
      !Array.isArray(p.weights[key]) ||
      p.weights[key].length !== length ||
      p.weights[key].some((v) => !Number.isFinite(v))
    )
      throw new Error("RL 가중치가 손상되었습니다.");
  }
  return p;
}
export function rlStrategy(policy: PolicyFile): Strategy {
  const network = new QNetwork(1, parsePolicy(policy).weights, policy.network);
  return {
    id: "rl",
    diagnose(observation) {
      const observed = agentObservation(observation, policy.featureMode);
      return {
        observation: observed,
        qValues: network.forward(encode(observed, network.actions)).q,
        featureMode: policy.featureMode,
      };
    },
    choose(observation) {
      return observation.candidates[
        network.action(
          encode(observation, network.actions, policy.featureMode),
          availableActions(observation),
        )
      ]!.spotId;
    },
  };
}
