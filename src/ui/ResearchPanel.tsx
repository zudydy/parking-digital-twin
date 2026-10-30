import { useEffect, useMemo, useState } from "react";
import type { Family } from "../research/config.js";
import { familyCases, demandLevels, NOISE_LEVELS } from "../research/config.js";
import { fmt } from "./presentation.js";
interface Stat {
  mean: number;
  trafficStd: number;
  learningStd: number;
}
interface Delta {
  mean: number;
  ci95: [number, number];
}
interface Summary {
  family: Family;
  kind: string;
  count: number;
  noise: number;
  strategy: string;
  learningSeeds: number[];
  trafficSeeds: number;
  metrics: Record<string, Stat>;
  pairedVsSearch: Record<string, Delta>;
  pairedVsNearest: Record<string, Delta>;
  fullMinusNoDeparture?: Record<string, Delta>;
  points: {
    seed: number;
    rejectionRate: number;
    operatingPerVehicle: number;
  }[];
}
interface TrainingLog {
  family: Family;
  featureMode: string;
  seed: number;
  history: {
    episode: number;
    loss: number;
    validationRejectionRate?: number;
    validationOperatingPerVehicle?: number;
  }[];
}
interface Report {
  schemaVersion: number;
  objective: string;
  runs: number;
  generatedAt: string;
  summaries: Summary[];
  bootstrap: { iterations: number; method: string };
  manifest: {
    episodes: number;
    learningSeeds: number[];
    testSeeds: number[];
    selection: string;
    entries: {
      id: string;
      family: Family;
      featureMode: string;
      seed: number;
      logUrl: string;
    }[];
  };
}
const names: Record<string, string> = {
  standard: "기본 20면",
  airport: "인천공항 80면",
  asymmetric: "비대칭 출구 20면",
  search: "무안내 · 직접 탐색",
  nearest: "빈자리 안내 · Nearest",
  random: "무작위 빈자리 안내",
  rule: "혼잡 고려 안내 · Rule-based",
  trained: "RL · 출차정보 사용",
  "no-departure": "RL · 출차정보 제외",
  untrained: "안내 · 학습 전 초기 정책",
  office: "사무실",
  cinema: "공연장",
  mall: "쇼핑몰",
  ground: "지상1층",
  b1: "지하1층",
  b2: "지하2층",
};
const colors: Record<string, string> = {
  search: "#be936c",
  nearest: "#97a79c",
  random: "#b5bc9a",
  rule: "#b19d77",
  trained: "#368465",
  "no-departure": "#9a8cba",
  untrained: "#b7bec7",
};
function ErrorBars({
  rows,
  metric,
  title,
}: {
  rows: Summary[];
  metric: string;
  title: string;
}) {
  const max =
    Math.max(
      1,
      ...rows.map(
        (r) => r.metrics[metric]!.mean + r.metrics[metric]!.trafficStd,
      ),
    ) * 1.12;
  return (
    <svg
      viewBox="0 0 700 255"
      role="img"
      aria-label={title}
      className="research-chart"
    >
      <text x="42" y="17" className="chart-title">
        {title}
      </text>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line
            x1="45"
            x2="680"
            y1={205 - t * 160}
            y2={205 - t * 160}
            stroke="#e5ebdf"
          />
          <text x="37" y={209 - t * 160} textAnchor="end">
            {fmt(max * t, 1)}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const m = r.metrics[metric]!,
          x = 55 + i * (635 / rows.length),
          w = (635 / rows.length) * 0.57,
          y = 205 - (m.mean / max) * 160,
          low = 205 - (Math.max(0, m.mean - m.trafficStd) / max) * 160,
          high = 205 - ((m.mean + m.trafficStd) / max) * 160;
        return (
          <g key={r.strategy}>
            <rect
              x={x}
              y={y}
              width={w}
              height={205 - y}
              rx="4"
              fill={colors[r.strategy]}
            />
            <line
              x1={x + w / 2}
              x2={x + w / 2}
              y1={high}
              y2={low}
              stroke="#52644f"
            />
            <line
              x1={x + w / 2 - 5}
              x2={x + w / 2 + 5}
              y1={high}
              y2={high}
              stroke="#52644f"
            />
            <text x={x + w / 2} y={Math.max(34, high - 9)} textAnchor="middle">
              {fmt(m.mean, 2)}
            </text>
            <text x={x + w / 2} y="225" textAnchor="middle">
              {r.strategy === "trained"
                ? "RL full"
                : r.strategy === "no-departure"
                  ? "RL no-info"
                  : r.strategy}
            </text>
            <title>
              {names[r.strategy]} 평균 {m.mean}, 교통 seed 표준편차{" "}
              {m.trafficStd}, 학습 seed 표준편차 {m.learningStd}
            </title>
          </g>
        );
      })}
    </svg>
  );
}
function TrainingChart({
  logs,
  metric,
  title,
}: {
  logs: TrainingLog[];
  metric: "loss" | "validationRejectionRate" | "validationOperatingPerVehicle";
  title: string;
}) {
  const points = logs.flatMap((l) =>
    l.history
      .filter((row) => row[metric] !== undefined)
      .map((row) => row[metric]!),
  );
  const low = metric === "loss" ? 0 : Math.min(...points, Infinity);
  const high = Math.max(...points, 1);
  const padding = metric === "loss" ? 0 : Math.max(0.005, (high - low) * 0.15);
  const min = Number.isFinite(low) ? Math.max(0, low - padding) : 0;
  const max = Math.max(
    min + 0.01,
    high + (metric === "loss" ? high * 0.1 : padding),
  );
  const end = Math.max(
    1,
    ...logs.flatMap((l) => l.history.map((r) => r.episode)),
  );
  return (
    <svg
      viewBox="0 0 700 220"
      role="img"
      aria-label={title}
      className="research-chart"
    >
      <text x="42" y="17" className="chart-title">
        {title}
      </text>
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line
            x1="45"
            x2="680"
            y1={180 - t * 140}
            y2={180 - t * 140}
            stroke="#e5ebdf"
          />
          <text x="37" y={184 - t * 140} textAnchor="end">
            {fmt(min + (max - min) * t, metric === "loss" ? 1 : 2)}
          </text>
        </g>
      ))}
      {logs.map((l, i) => (
        <polyline
          key={`${l.featureMode}-${l.seed}`}
          fill="none"
          stroke={
            l.featureMode === "full"
              ? ["#2e6753", "#43957c", "#73b496"][i % 3]
              : ["#725c98", "#9c82b8", "#c1a4ca"][i % 3]
          }
          strokeWidth="1.5"
          strokeDasharray={l.featureMode === "full" ? undefined : "4 3"}
          points={l.history
            .filter((r) => r[metric] !== undefined)
            .map(
              (r) =>
                `${45 + (r.episode / end) * 635},${180 - ((r[metric]! - min) / (max - min)) * 140}`,
            )
            .join(" ")}
        >
          <title>
            {l.featureMode} · learning seed {l.seed}
          </title>
        </polyline>
      ))}
      <text x="45" y="207">
        0
      </text>
      <text x="680" y="207" textAnchor="end">
        {end} episodes
      </text>
    </svg>
  );
}
function PairedDots({
  row,
  reference,
}: {
  row: Summary | undefined;
  reference: Summary | undefined;
}) {
  if (!row || !reference) return null;
  const values = row.points.map((p) => ({
    seed: p.seed,
    value:
      p.operatingPerVehicle -
      reference.points.find((r) => r.seed === p.seed)!.operatingPerVehicle,
  }));
  const max = Math.max(0.1, ...values.map((p) => Math.abs(p.value))) * 1.2;
  return (
    <svg
      viewBox="0 0 700 205"
      role="img"
      aria-label="교통 seed별 Nearest 대비 운영비용 차이"
      className="research-chart"
    >
      <text x="42" y="17" className="chart-title">
        교통 seed별 RL − Nearest 운영비용/입력 차량 차이
      </text>
      <line
        x1="45"
        x2="680"
        y1="88"
        y2="88"
        stroke="#a9baa0"
        strokeDasharray="4 3"
      />
      {[-1, 0, 1].map((v) => (
        <g key={v}>
          <text x="38" y={92 - v * 50} textAnchor="end">
            {fmt(v * max, 2)}
          </text>
          <line
            x1="45"
            x2="680"
            y1={88 - v * 50}
            y2={88 - v * 50}
            stroke="#dfe6d9"
            strokeDasharray="3 3"
          />
        </g>
      ))}
      <text x="45" y="167">
        90001
      </text>
      <text x="680" y="167" textAnchor="end">
        교통 seed · 90030
      </text>
      {values.map((p, i) => (
        <g key={p.seed}>
          <line
            x1={55 + i * 21}
            x2={55 + i * 21}
            y1="88"
            y2={88 - (p.value / max) * 50}
            stroke={p.value <= 0 ? "#6a9e7c" : "#c2a076"}
          />
          <circle
            cx={55 + i * 21}
            cy={88 - (p.value / max) * 50}
            r="3"
            fill={p.value <= 0 ? "#368465" : "#b98c52"}
          >
            <title>
              seed {p.seed}: {fmt(p.value, 4)}
            </title>
          </circle>
        </g>
      ))}
      <text x="45" y="192">
        음수: RL 운영비용 감소 · 각 점은 학습 seed 3개 평균 · 처리율을 먼저
        비교하세요.
      </text>
    </svg>
  );
}
export function ResearchPanel() {
  const [report, setReport] = useState<Report | null>(null),
    [logs, setLogs] = useState<TrainingLog[]>([]),
    [error, setError] = useState("");
  const [family, setFamily] = useState<Family>("airport"),
    [kind, setKind] = useState("ground"),
    [count, setCount] = useState(180),
    [noise, setNoise] = useState(6);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}research/analysis.json`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok)
          throw new Error(
            "실험 분석 파일이 없습니다. pnpm research:evaluate를 실행하세요.",
          );
        return r.json();
      })
      .then((r) => {
        if (r.schemaVersion !== 3 || r.objective !== "service-first-v2")
          throw new Error("분석 목적함수 버전이 다릅니다.");
        setReport(r);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message));
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!report) return;
    const controller = new AbortController();
    Promise.all(
      report.manifest.entries
        .filter((e) => e.family === family)
        .map(async (entry) => {
          const response = await fetch(
            `${import.meta.env.BASE_URL}${entry.logUrl}`,
            { signal: controller.signal },
          );
          if (!response.ok) throw new Error("학습 로그를 불러오지 못했습니다.");
          return response.json() as Promise<TrainingLog>;
        }),
    )
      .then(setLogs)
      .catch((e) => {
        if (e.name !== "AbortError") setError(String(e.message));
      });
    return () => controller.abort();
  }, [report, family]);
  const rows = useMemo(
    () =>
      report?.summaries.filter(
        (s) =>
          s.family === family &&
          s.kind === kind &&
          s.count === count &&
          s.noise === noise,
      ) ?? [],
    [report, family, kind, count, noise],
  );
  const nearest = rows.find((r) => r.strategy === "nearest");
  const full = rows.find((r) => r.strategy === "trained");
  const changeFamily = (f: Family) => {
    setFamily(f);
    setKind(familyCases(f)[0]!);
    setCount(demandLevels(f)[1]!);
  };
  if (error)
    return (
      <section className="panel research-error" role="alert">
        {error}
      </section>
    );
  if (!report)
    return (
      <section className="panel research-error">
        실험 결과를 불러오고 있습니다…
      </section>
    );
  return (
    <section className="research-workspace">
      <div className="intro">
        <div>
          <div className="eyebrow">EXPERIMENTS / REPRODUCIBLE EVIDENCE</div>
          <h1>직접 탐색과 안내, 효과를 나눠 검증합니다.</h1>
          <p>
            무안내 탐색 · 빈자리 안내 · RL 안내 · 같은 수요의 대응 비교 ·
            출차정보 제거 실험
          </p>
        </div>
        <a
          className="download-link"
          href={`${import.meta.env.BASE_URL}research/runs.csv.gz`}
          download
        >
          ↓ 전체 실행 CSV.gz
        </a>
      </div>
      <div className="research-kpis">
        <article>
          <span>평가 실행 (대응 비교)</span>
          <strong>
            {report.runs.toLocaleString()}
            <small>runs</small>
          </strong>
        </article>
        <article>
          <span>학습 정책</span>
          <strong>
            {report.manifest.entries.length}
            <small>models</small>
          </strong>
        </article>
        <article>
          <span>학습/교통 seed</span>
          <strong>3 / 30</strong>
        </article>
        <article>
          <span>평가 목적</span>
          <strong className="kpi-label">처리율 우선</strong>
        </article>
      </div>
      <div className="panel research-controls">
        <label>
          환경
          <select
            aria-label="분석 환경"
            value={family}
            onChange={(e) => changeFamily(e.target.value as Family)}
          >
            {(["standard", "airport", "asymmetric"] as Family[]).map((f) => (
              <option key={f} value={f}>
                {names[f]}
              </option>
            ))}
          </select>
        </label>
        <label>
          수요/층
          <select
            aria-label="분석 시나리오"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {familyCases(family).map((k) => (
              <option key={k} value={k}>
                {names[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          입력 차량
          <select
            aria-label="분석 차량 수"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {demandLevels(family).map((n) => (
              <option key={n} value={n}>
                {n}대
              </option>
            ))}
          </select>
        </label>
        <label>
          출차 예측 오차
          <select
            aria-label="분석 예측 오차"
            value={noise}
            onChange={(e) => setNoise(Number(e.target.value))}
          >
            {NOISE_LEVELS.map((n) => (
              <option key={n} value={n}>
                ±{n} tick
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="research-charts">
        <section className="panel">
          <ErrorBars
            rows={rows}
            metric="averageParkingTime"
            title="입장 → 주차 완료 (tick) · 주차 성공 차량 평균"
          />
          <p>
            직접 탐색의 이동·대기가 포함됩니다. 실패율과 공통 성공 차량의 대응
            비교를 함께 확인하세요.
          </p>
        </section>
        <section className="panel">
          <ErrorBars
            rows={rows}
            metric="averageDetourDistance"
            title="탐색 우회거리 · 최종 자리 최단 경로 대비 초과"
          />
          <p>
            안내 차량의 우회거리는 0입니다. 전체 이동거리가 0이라는 뜻은
            아닙니다.
          </p>
        </section>
      </div>
      <section className="panel paired-summary">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">
              GUIDANCE EFFECT / SHARED SUCCESSFUL VEHICLES
            </div>
            <h2>무안내 직접 탐색 대비 안내의 효과</h2>
            <p>
              주차시간·거리는 양쪽에서 모두 주차한 차량끼리 대응합니다.
              미배정률은 전체 입력 기준입니다.
            </p>
          </div>
        </div>
        <div className="paired-grid">
          {[nearest, full]
            .filter((r): r is Summary => !!r)
            .flatMap((r) =>
              [
                "matchedParkingDelta",
                "matchedDistanceDelta",
                "rejectionRate",
              ].map((key) => (
                <article key={`${r.strategy}-${key}`}>
                  <span>
                    {r.strategy === "nearest" ? "빈자리 안내" : "RL 안내"} −
                    무안내 ·{" "}
                    {key === "matchedParkingDelta"
                      ? "공통 성공 차량 주차시간"
                      : key === "matchedDistanceDelta"
                        ? "공통 성공 차량 총 이동거리"
                        : "미배정률 (%p)"}
                  </span>
                  <strong>{fmt(r.pairedVsSearch[key]!.mean, 3)}</strong>
                  <p>
                    탐색적 95% 구간 [
                    {r.pairedVsSearch[key]!.ci95.map((v) => fmt(v, 3)).join(
                      ", ",
                    )}
                    ]
                  </p>
                </article>
              )),
            )}
        </div>
        <p className="result-note">
          음수는 안내 방식의 해당 지표 감소입니다. 성공 차량만의 비교에는 선택
          편향이 있을 수 있어 미배정률을 반드시 함께 표시합니다. 탐색 모델은
          실측 운전자 행동으로 보정되지 않은 통제 모델입니다.
        </p>
      </section>
      <div className="research-charts">
        <section className="panel">
          <ErrorBars
            rows={rows}
            metric="rejectionRate"
            title="미배정률 (%) · 낮을수록 유리"
          />
          <p>막대: 평균 · 오차막대: 학습 seed를 평균한 교통 seed 표준편차</p>
        </section>
        <section className="panel">
          <ErrorBars
            rows={rows}
            metric="operatingPerVehicle"
            title="운영비용 / 입력 차량 · 처리율과 함께 해석"
          />
          <p>운영비용 = 이동 + 주차 조작 + 통로 대기 + 일정 지연</p>
        </section>
      </div>
      <section className="panel paired-summary">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">PAIRED COMPARISON</div>
            <h2>안내 전략 사이에서 RL이 더 개선했을까</h2>
          </div>
          <a
            href={`${import.meta.env.BASE_URL}research/analysis.json`}
            download
          >
            분석 JSON ↓
          </a>
        </div>
        {full && (
          <div className="paired-grid">
            {["rejectionRate", "operatingPerVehicle"].map((key) => (
              <article key={key}>
                <span>
                  RL 안내 − Nearest 안내 ·{" "}
                  {key === "rejectionRate" ? "미배정률 (%p)" : "운영비용/차량"}
                </span>
                <strong>{fmt(full.pairedVsNearest[key]!.mean, 4)}</strong>
                <p>
                  탐색적 95% 구간 [
                  {full.pairedVsNearest[key]!.ci95.map((n) => fmt(n, 4)).join(
                    ", ",
                  )}
                  ]
                </p>
              </article>
            ))}
            {["rejectionRate", "operatingPerVehicle"].map((key) => (
              <article key={`ablation-${key}`}>
                <span>
                  출차정보 사용 − 제외 ·{" "}
                  {key === "rejectionRate" ? "미배정률 (%p)" : "운영비용/차량"}
                </span>
                <strong>
                  {fmt(full.fullMinusNoDeparture?.[key]?.mean ?? 0, 4)}
                </strong>
                <p>
                  탐색적 95% 구간 [
                  {full.fullMinusNoDeparture?.[key]?.ci95
                    .map((n) => fmt(n, 4))
                    .join(", ")}
                  ]
                </p>
              </article>
            ))}
          </div>
        )}
        <PairedDots
          row={full}
          reference={rows.find((r) => r.strategy === "nearest")}
        />
        <p className="result-note">
          학습 seed와 공유 교통 seed를 각각 재표집한 대응 bootstrap{" "}
          {report.bootstrap.iterations.toLocaleString()}회입니다. 학습 seed
          3개에 대한 탐색적 구간이며 일반적 우수성이나 유의성을 보장하지
          않습니다.
        </p>
      </section>
      <section className="panel sensitivity">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">SENSITIVITY</div>
            <h2>수요와 예측 오차가 바뀌면</h2>
            <p>RL − Nearest 미배정률 차이 (%p) · 음수는 RL의 미배정 감소</p>
          </div>
        </div>
        <div className="sensitivity-grid">
          <div />{" "}
          {NOISE_LEVELS.map((u) => (
            <strong key={u}>오차 ±{u}</strong>
          ))}
          {demandLevels(family).flatMap((c) => [
            <strong key={`${c}-label`}>{c}대</strong>,
            ...NOISE_LEVELS.map((u) => {
              const s = report.summaries.find(
                (s) =>
                  s.family === family &&
                  s.kind === kind &&
                  s.count === c &&
                  s.noise === u &&
                  s.strategy === "trained",
              );
              const d = s?.pairedVsNearest.rejectionRate?.mean ?? 0;
              return (
                <button
                  key={`${c}-${u}`}
                  aria-pressed={count === c && noise === u}
                  style={{
                    background:
                      Math.abs(d) < 0.00001
                        ? "#f1f4ed"
                        : d < 0
                          ? "#e0efdf"
                          : "#f6eadb",
                  }}
                  onClick={() => {
                    setCount(c);
                    setNoise(u);
                  }}
                >
                  <strong>{fmt(d, 3)}</strong>
                  <small>조건 자세히 보기 →</small>
                </button>
              );
            }),
          ])}
        </div>
      </section>
      <div className="research-charts training-charts">
        <section className="panel">
          <TrainingChart
            logs={logs}
            metric="validationRejectionRate"
            title="검증 미배정률 (%) · 체크포인트 선택의 1차 기준"
          />
          <TrainingChart
            logs={logs}
            metric="validationOperatingPerVehicle"
            title="검증 운영비용/차량 · 미배정률 동률 시 2차 기준"
          />
        </section>
        <section className="panel">
          <TrainingChart
            logs={logs}
            metric="loss"
            title="학습 Huber loss · 보상 개선과 별개인 최적화 지표"
          />
          <p>
            기존 안내 정책의 학습 기록 · 초록 실선: 출차정보 사용 · 보라 점선:
            제외 · 각 선은 독립 학습 seed입니다.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">VARIATION ACROSS LEARNING RUNS</div>
            <h2>평균 뒤의 변동성</h2>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>정책</th>
                <th>학습 seed 수</th>
                <th>미배정률 평균</th>
                <th>학습 seed 표준편차</th>
                <th>운영비용/차량 평균</th>
                <th>학습 seed 표준편차</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.strategy}>
                  <td>{names[r.strategy]}</td>
                  <td>
                    {r.learningSeeds[0] === -1
                      ? "기준 전략"
                      : r.learningSeeds.length}
                  </td>
                  <td>{fmt(r.metrics.rejectionRate!.mean, 3)}%</td>
                  <td>{fmt(r.metrics.rejectionRate!.learningStd, 3)}</td>
                  <td>{fmt(r.metrics.operatingPerVehicle!.mean, 3)}</td>
                  <td>{fmt(r.metrics.operatingPerVehicle!.learningStd, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel figure-downloads">
        <div>
          <div className="eyebrow">REPORT ASSETS</div>
          <h2>보고서에 사용할 그림과 설정</h2>
          <p>
            보고서에 붙일 수 있는 고해상도 그림입니다. 제목에 표시된 조건을
            확인하세요.
          </p>
        </div>
        <div>
          {["summary", "learning", "sensitivity"].map((name) => (
            <a
              key={name}
              href={`${import.meta.env.BASE_URL}research/figures/${family}-${name}.png`}
              download
            >
              {name === "summary"
                ? "성능 비교"
                : name === "learning"
                  ? "학습 곡선"
                  : "민감도"}{" "}
              PNG ↓
            </a>
          ))}
          <a
            href={`${import.meta.env.BASE_URL}research/search-sensitivity.json`}
            download
          >
            탐색 시작 방식 민감도 JSON ↓
          </a>
          <a href={`${import.meta.env.BASE_URL}research/overall.json`} download>
            전체 조건 요약 JSON ↓
          </a>
          <a
            href={`${import.meta.env.BASE_URL}research/manifest.json`}
            download
          >
            실험 설정 JSON ↓
          </a>
        </div>
      </section>
      <p className="research-footnote">
        평가에 사용한 정책은 검증 데이터로만 선택했습니다. 학습 seed 전체가
        평가에 포함되며, 테스트에서 성능이 좋은 seed만 추리지 않았습니다. v0.4는
        안내 전략끼리만 비교한 과거 실험입니다. 무안내 탐색과의 비교는 이번
        버전에서 추가했습니다.
      </p>
    </section>
  );
}
