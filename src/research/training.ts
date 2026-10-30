import { TwinEnvironment, simulateTwin } from "../twin/engine.js";
import { compareValidation, OBJECTIVE_VERSION } from "../twin/objective.js";
import { seededRandom } from "../twin/strategies.js";
import type { AirportSnapshot } from "../data/incheon.js";
import {
  QNetwork,
  encode,
  availableActions,
  type PolicyFile,
  type Transition,
} from "../rl/dqn.js";
import {
  familyCases,
  demandLevels,
  networkShape,
  NOISE_LEVELS,
  VAL_SEEDS,
  makeResearchScenario,
  type Family,
  type FeatureMode,
} from "./config.js";
export interface TrainingRow {
  episode: number;
  kind: string;
  count: number;
  noise: number;
  cost: number;
  rejectionRate: number;
  operatingPerVehicle: number;
  epsilon: number;
  loss: number;
  validationRejectionRate?: number;
  validationOperatingPerVehicle?: number;
}
export async function trainPolicy(config: {
  family: Family;
  featureMode: FeatureMode;
  seed: number;
  episodes: number;
  snapshot: AirportSnapshot;
  onProgress?: (row: TrainingRow) => void;
}) {
  const { family, featureMode, seed, episodes, snapshot } = config,
    shape = networkShape(family),
    rng = seededRandom(seed),
    network = new QNetwork(seed, undefined, shape);
  let target = new QNetwork(1, network.weights, shape),
    cursor = 0,
    decisions = 0,
    updates = 0;
  const replay: Transition[] = [],
    history: TrainingRow[] = [];
  let best = { rejectionRate: Infinity, operatingPerVehicle: Infinity },
    bestWeights = structuredClone(network.weights),
    selectedEpisode = 0;
  const kinds = familyCases(family),
    counts = demandLevels(family);
  for (let episode = 0; episode < episodes; episode++) {
    const kind = kinds[episode % kinds.length]!,
      count = counts[Math.floor(episode / 3) % 3]!,
      noise = NOISE_LEVELS[Math.floor(episode / 9) % 3]!;
    const scenario = makeResearchScenario(
        family,
        kind,
        1000 + episode,
        count,
        noise,
        snapshot,
      ),
      env = new TwinEnvironment(scenario, false);
    const epsilon = Math.max(0.06, 1 - episode / (episodes * 0.8));
    let loss = 0,
      batches = 0;
    while (!env.done) {
      const observation = env.observation()!,
        state = encode(observation, shape.actions, featureMode),
        available = availableActions(observation);
      const action =
        rng() < epsilon
          ? available[Math.floor(rng() * available.length)]!
          : network.action(state, available);
      const transition = env.step(observation.candidates[action]!.spotId),
        next = env.observation();
      const item: Transition = {
        state,
        action,
        reward: transition.reward,
        next: next ? encode(next, shape.actions, featureMode) : null,
        available: next ? availableActions(next) : [],
      };
      if (replay.length < 12000) replay.push(item);
      else {
        replay[cursor] = item;
        cursor = (cursor + 1) % 12000;
      }
      if (++decisions % 4 === 0 && replay.length >= 64) {
        const batch = Array.from(
          { length: 16 },
          () => replay[Math.floor(rng() * replay.length)]!,
        );
        loss += network.train(batch, target, 1, 0.0003);
        batches++;
        if (++updates % 100 === 0)
          target = new QNetwork(1, network.weights, shape);
      }
    }
    const metrics = env.result("rl").metrics;
    const row: TrainingRow = {
      episode: episode + 1,
      kind,
      count,
      noise,
      cost: metrics.cost,
      rejectionRate: metrics.rejectionRate,
      operatingPerVehicle: metrics.operatingCost / count,
      epsilon,
      loss: batches ? loss / batches : 0,
    };
    if ((episode + 1) % 50 === 0 || episode === episodes - 1) {
      let rejected = 0,
        operating = 0,
        n = 0;
      for (const validationKind of kinds)
        for (let c = 0; c < 3; c++)
          for (let u = 0; u < 3; u++) {
            const validation = makeResearchScenario(
              family,
              validationKind,
              VAL_SEEDS[(c + u) % 3]!,
              counts[c]!,
              NOISE_LEVELS[u]!,
              snapshot,
            );
            const result = simulateTwin(
              validation,
              {
                id: "rl",
                choose(obs) {
                  return obs.candidates[
                    network.action(
                      encode(obs, shape.actions, featureMode),
                      availableActions(obs),
                    )
                  ]!.spotId;
                },
              },
              false,
            ).metrics;
            rejected += result.rejectionRate;
            operating += result.operatingCost / validation.vehicles.length;
            n++;
          }
      const score = {
        rejectionRate: rejected / n,
        operatingPerVehicle: operating / n,
      };
      row.validationRejectionRate = score.rejectionRate;
      row.validationOperatingPerVehicle = score.operatingPerVehicle;
      if (compareValidation(score, best) < 0) {
        best = score;
        bestWeights = structuredClone(network.weights);
        selectedEpisode = episode + 1;
      }
      config.onProgress?.(row);
    }
    history.push(row);
    // Let callers flush logs and keep the training process responsive between episodes.
    if (episode % 10 === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const policy: PolicyFile = {
    version: 2,
    objective: OBJECTIVE_VERSION,
    featureMode,
    environment: family,
    encoding: family === "airport" ? "parking-80-v1" : "parking-20-v1",
    network: shape,
    algorithm: "DQN",
    weights: bestWeights,
    training: {
      episodes,
      seed,
      gamma: 1,
      learningRate: 0.0003,
      reward:
        "-100 × Δ(rejected + operatingCost/(operatingScale+operatingCost)); operating=travel+parking+waiting+schedule shift",
      trainingSeeds: [1000, 1000 + episodes - 1],
      validationSeeds: VAL_SEEDS,
      selectedEpisode,
      validationCost: best.operatingPerVehicle,
      validationRejectionRate: best.rejectionRate,
      validationOperatingPerVehicle: best.operatingPerVehicle,
    },
  };
  return {
    policy,
    log: {
      schemaVersion: 2,
      objective: OBJECTIVE_VERSION,
      family,
      featureMode,
      seed,
      episodes,
      network: shape,
      snapshot,
      updates,
      selection:
        "lexicographic mean rejection rate, then mean operating cost per input; validation only",
      history,
    },
  };
}
