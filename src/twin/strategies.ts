import type { Observation, Strategy } from './model.js';
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => { state += 0x6d2b79f5; let t = Math.imul(state ^ state >>> 15, state | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function baseline(id: 'nearest' | 'random' | 'rule', seed = 1): Strategy {
  const random = seededRandom(seed);
  return { id, choose(observation: Observation) {
    const candidates = observation.candidates.filter(c => c.available);
    if (!candidates.length) throw new Error('배정할 빈 주차면이 없습니다.');
    if (id === 'random') return candidates[Math.floor(random() * candidates.length)]!.spotId;
    const score = (c: typeof candidates[number]) => c.inboundDistance + (id === 'rule' ? 2 * c.queue + 3 * c.departurePressure + 0.3 * c.outboundDistance : 0);
    return [...candidates].sort((a, b) => score(a) - score(b) || a.spotId - b.spotId)[0]!.spotId;
  } };
}
