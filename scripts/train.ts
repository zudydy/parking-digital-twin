import { readFile } from "node:fs/promises";
import { createAirportScenario } from "../src/twin/airport.js";
import { validateSnapshot } from "../src/data/incheon.js";
import { mkdir, writeFile } from "node:fs/promises";
import { TwinEnvironment, simulateTwin } from "../src/twin/engine.js";
import { createScenario, scenarioTypes } from "../src/twin/scenarios.js";
import { seededRandom } from "../src/twin/strategies.js";
import {
  availableActions,
  encode,
  ENCODING,
  QNetwork,
  rlStrategy,
  type PolicyFile,
  type Transition,
} from "../src/rl/dqn.js";

const episodes = Number(process.argv[2] ?? 450);
const seed = Number(process.argv[3] ?? 20261027);
const airportMode = process.argv.includes("--airport");
const shape = airportMode
  ? { inputs: 403, hidden: 48, actions: 80 }
  : { inputs: 103, hidden: 32, actions: 20 };
const snapshot = airportMode
  ? validateSnapshot(
      JSON.parse(await readFile("public/data/incheon-t1.json", "utf8")),
    )
  : null;
const makeScenario = (
  type: (typeof scenarioTypes)[number],
  seed: number,
  count = 70,
) =>
  snapshot
    ? createAirportScenario(snapshot, "ground", seed, 100 + count)
    : createScenario(type, seed, count);
if (
  !Number.isSafeInteger(episodes) ||
  episodes < 1 ||
  episodes > 10000 ||
  !Number.isSafeInteger(seed)
)
  throw new Error("학습 episode 수와 seed를 확인하세요.");
const random = seededRandom(seed);
const network = new QNetwork(seed, undefined, shape);
let target = new QNetwork(1, network.weights, shape);
const replay: Transition[] = [];
let replayCursor = 0,
  decisions = 0,
  updates = 0;
const gamma = 0.98,
  learningRate = 0.0003;
const history: {
  episode: number;
  type: string;
  cost: number;
  epsilon: number;
  loss: number;
  validationCost?: number;
}[] = [];
let bestCost = Infinity,
  bestEpisode = 0,
  bestWeights = structuredClone(network.weights);
const validationSeeds = [50001, 50002, 50003];
function policy(weights = network.weights): PolicyFile {
  return {
    version: 1,
    encoding: airportMode ? "parking-80-v1" : ENCODING,
    network: shape,
    algorithm: "DQN",
    weights,
    training: {
      episodes,
      seed,
      gamma,
      learningRate,
      reward:
        "-(travel ticks + parking ticks + waiting ticks + 30 × rejections) / 20; decision-based discount",
      trainingSeeds: [1000, 1000 + episodes - 1],
      validationSeeds,
      selectedEpisode: bestEpisode,
      validationCost: bestCost,
    },
  };
}
await mkdir("experiments", { recursive: true });
await mkdir("public", { recursive: true });
for (let episode = 0; episode < episodes; episode++) {
  const type = scenarioTypes[episode % scenarioTypes.length]!;
  const environment = new TwinEnvironment(
    makeScenario(type, 1000 + episode, 55 + Math.floor(random() * 30)),
    false,
  );
  const epsilon = Math.max(0.08, 1 - episode / (episodes * 0.8));
  let totalLoss = 0,
    batchCount = 0;
  while (!environment.done) {
    const observation = environment.observation()!;
    const state = encode(observation, shape.actions),
      available = availableActions(observation);
    const action =
      random() < epsilon
        ? available[Math.floor(random() * available.length)]!
        : network.action(state, available);
    const transition = environment.step(observation.candidates[action]!.spotId);
    const next = environment.observation();
    const item: Transition = {
      state,
      action,
      reward: transition.reward,
      next: next ? encode(next, shape.actions) : null,
      available: next ? availableActions(next) : [],
    };
    if (replay.length < 10000) replay.push(item);
    else {
      replay[replayCursor] = item;
      replayCursor = (replayCursor + 1) % 10000;
    }
    if (++decisions % 4 === 0 && replay.length >= 64) {
      const batch = Array.from(
        { length: 16 },
        () => replay[Math.floor(random() * replay.length)]!,
      );
      totalLoss += network.train(batch, target, gamma, learningRate);
      batchCount++;
      if (++updates % 100 === 0)
        target = new QNetwork(1, network.weights, shape);
    }
  }
  const row: (typeof history)[number] = {
    episode: episode + 1,
    type,
    cost: environment.cost,
    epsilon,
    loss: batchCount ? totalLoss / batchCount : 0,
  };
  if ((episode + 1) % 25 === 0 || episode === episodes - 1) {
    const costs = (airportMode ? ["office" as const] : scenarioTypes).flatMap(
      (t) =>
        validationSeeds.map(
          (s) =>
            simulateTwin(makeScenario(t, s), rlStrategy(policy()), false)
              .metrics.cost,
        ),
    );
    row.validationCost = costs.reduce((a, b) => a + b, 0) / costs.length;
    if (row.validationCost < bestCost) {
      bestCost = row.validationCost;
      bestWeights = structuredClone(network.weights);
      bestEpisode = episode + 1;
    }
    console.log(
      JSON.stringify({
        episode: episode + 1,
        validationCost: row.validationCost,
        bestCost,
        loss: row.loss,
      }),
    );
  }
  history.push(row);
}
await writeFile(
  airportMode ? "public/policy-airport.json" : "public/policy.json",
  JSON.stringify(policy(bestWeights)) + "\n",
);
await writeFile(
  airportMode
    ? "experiments/training-airport.json"
    : "experiments/training.json",
  JSON.stringify(
    {
      config: policy(bestWeights).training,
      network: shape,
      snapshot,
      updates,
      history,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `정책 저장 완료: episode ${bestEpisode}, validation cost ${bestCost.toFixed(2)}, updates ${updates}`,
);
