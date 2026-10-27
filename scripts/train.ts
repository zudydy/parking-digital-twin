import { mkdir, writeFile } from 'node:fs/promises';
import { TwinEnvironment, simulateTwin } from '../src/twin/engine.js';
import { createScenario, scenarioTypes } from '../src/twin/scenarios.js';
import { seededRandom } from '../src/twin/strategies.js';
import { availableActions, encode, ENCODING, QNetwork, rlStrategy, type PolicyFile, type Transition } from '../src/rl/dqn.js';

const episodes = Number(process.argv[2] ?? 450);
const seed = Number(process.argv[3] ?? 20261027);
if (!Number.isSafeInteger(episodes) || episodes < 1 || episodes > 10000 || !Number.isSafeInteger(seed)) throw new Error('학습 episode 수와 seed를 확인하세요.');
const random = seededRandom(seed);
const network = new QNetwork(seed);
let target = new QNetwork(1, network.weights);
const replay: Transition[] = [];
let replayCursor = 0, decisions = 0, updates = 0;
const gamma = 0.98, learningRate = 0.0003;
const history: { episode: number; type: string; cost: number; epsilon: number; loss: number; validationCost?: number }[] = [];
let bestCost = Infinity, bestEpisode = 0, bestWeights = structuredClone(network.weights);
const validationSeeds = [50001, 50002, 50003];
function policy(weights = network.weights): PolicyFile {
  return { version: 1, encoding: ENCODING, algorithm: 'DQN', weights, training: { episodes, seed, gamma, learningRate, reward: '-(travel ticks + parking ticks + waiting ticks + 30 × rejections) / 20; decision-based discount', trainingSeeds: [1000, 1000 + episodes - 1], validationSeeds, selectedEpisode: bestEpisode, validationCost: bestCost } };
}
await mkdir('experiments', { recursive: true });
await mkdir('public', { recursive: true });
for (let episode = 0; episode < episodes; episode++) {
  const type = scenarioTypes[episode % scenarioTypes.length]!;
  const environment = new TwinEnvironment(createScenario(type, 1000 + episode, 55 + Math.floor(random() * 30)), false);
  const epsilon = Math.max(0.08, 1 - episode / (episodes * 0.8));
  let totalLoss = 0, batchCount = 0;
  while (!environment.done) {
    const observation = environment.observation()!;
    const state = encode(observation), available = availableActions(observation);
    const action = random() < epsilon ? available[Math.floor(random() * available.length)]! : network.action(state, available);
    const transition = environment.step(observation.candidates[action]!.spotId);
    const next = environment.observation();
    const item: Transition = { state, action, reward: transition.reward, next: next ? encode(next) : null, available: next ? availableActions(next) : [] };
    if (replay.length < 10000) replay.push(item); else { replay[replayCursor] = item; replayCursor = (replayCursor + 1) % 10000; }
    if (++decisions % 4 === 0 && replay.length >= 64) {
      const batch = Array.from({ length: 16 }, () => replay[Math.floor(random() * replay.length)]!);
      totalLoss += network.train(batch, target, gamma, learningRate); batchCount++;
      if (++updates % 100 === 0) target = new QNetwork(1, network.weights);
    }
  }
  const row: typeof history[number] = { episode: episode + 1, type, cost: environment.cost, epsilon, loss: batchCount ? totalLoss / batchCount : 0 };
  if ((episode + 1) % 25 === 0 || episode === episodes - 1) {
    const costs = scenarioTypes.flatMap(t => validationSeeds.map(s => simulateTwin(createScenario(t, s), rlStrategy(policy()), false).metrics.cost));
    row.validationCost = costs.reduce((a, b) => a + b, 0) / costs.length;
    if (row.validationCost < bestCost) { bestCost = row.validationCost; bestWeights = structuredClone(network.weights); bestEpisode = episode + 1; }
    console.log(JSON.stringify({ episode: episode + 1, validationCost: row.validationCost, bestCost, loss: row.loss }));
  }
  history.push(row);
}
await writeFile('public/policy.json', JSON.stringify(policy(bestWeights)) + '\n');
await writeFile('experiments/training.json', JSON.stringify({ config: policy(bestWeights).training, updates, history }, null, 2) + '\n');
console.log(`정책 저장 완료: episode ${bestEpisode}, validation cost ${bestCost.toFixed(2)}, updates ${updates}`);
