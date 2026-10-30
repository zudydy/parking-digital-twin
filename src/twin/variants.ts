import { createScenario, type ScenarioType } from "./scenarios.js";
import type { Scenario } from "./model.js";
export function createAsymmetricScenario(
  type: ScenarioType,
  seed = 42,
  count = 70,
  uncertainty = 6,
): Scenario {
  const scenario = createScenario(type, seed, count, uncertainty);
  scenario.id = `${type}-asymmetric`;
  scenario.title += " · 비대칭 출구";
  scenario.description =
    "독립 출구와 진입 간격이 다른 통로를 가진 통제 실험 · 실제 시설 도면 아님";
  scenario.layoutFamily = "asymmetric";
  scenario.layout.nodes.push({ id: "east-exit", x: 7, y: 1 });
  scenario.layout.edges.push({
    id: "n1-6>east-exit",
    from: "n1-6",
    to: "east-exit",
    ticks: 1,
    capacity: 1,
    headway: 3,
  });
  scenario.layout.exits = [scenario.layout.exit, "east-exit"];
  return scenario;
}
