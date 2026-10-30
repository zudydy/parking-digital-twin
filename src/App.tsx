import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { simulateTwin } from "./twin/engine.js";
import {
  createScenario,
  scenarioTypes,
  type ScenarioType,
} from "./twin/scenarios.js";
import { baseline } from "./twin/strategies.js";
import { parsePolicy, rlStrategy, type PolicyFile } from "./rl/dqn.js";
import { scenarioFromCsv } from "./twin/input.js";
import type { Metrics, Scenario } from "./twin/model.js";
import { RunPanel } from "./ui/ParkingMap.js";
import { Timeline } from "./ui/Timeline.js";
import {
  advanceTime,
  frameAt,
  fmt,
  labels,
  phaseLabels,
} from "./ui/presentation.js";
import { download } from "./ui/download.js";
import airportJson from "../public/data/incheon-t1.json?raw";
import { validateSnapshot, type FloorId } from "./data/incheon.js";
import { createAirportScenario } from "./twin/airport.js";
import { AirportDataPanel } from "./ui/AirportDataPanel.js";
type ModelType = ScenarioType | "incheon";
const metricRows: {
  key: keyof Metrics;
  label: string;
  unit: string;
  lower?: boolean;
}[] = [
  {
    key: "averageParkingTime",
    label: "평균 주차 소요시간",
    unit: "tick",
    lower: true,
  },
  {
    key: "averageExitTime",
    label: "평균 출차 소요시간",
    unit: "tick",
    lower: true,
  },
  { key: "totalDelay", label: "누적 통로 지연", unit: "tick", lower: true },
  { key: "rejectionRate", label: "미배정률", unit: "%", lower: true },
  { key: "averageOccupancyRate", label: "시간가중 점유율", unit: "%" },
  { key: "averageDistance", label: "평균 총 이동거리", unit: "단위" },
  { key: "cost", label: "누적 비용", unit: "", lower: true },
];
export function App() {
  const [policy, setPolicy] = useState<PolicyFile | null>(null);
  const [policyError, setPolicyError] = useState("");
  const [airportPolicy, setAirportPolicy] = useState<PolicyFile | null>(null);
  const [airportSnapshot, setAirportSnapshot] = useState(() =>
    validateSnapshot(JSON.parse(airportJson)),
  );
  const [floor, setFloor] = useState<FloorId>("ground");
  const [dataLoading, setDataLoading] = useState(false),
    [dataMode, setDataMode] = useState("snapshot"),
    [dataError, setDataError] = useState("");
  const [viewMode, setViewMode] = useState<"focus" | "compare">("focus"),
    [night, setNight] = useState(false);
  async function refreshAirport() {
    setDataLoading(true);
    setDataError("");
    try {
      const response = await fetch("/api/incheon", {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error();
      const next = validateSnapshot(await response.json());
      setAirportSnapshot(next);
      setDataMode("live");
    } catch {
      setDataError(
        "공식 현황을 갱신하지 못했습니다. 표시된 시각의 저장 스냅샷을 유지합니다.",
      );
    } finally {
      setDataLoading(false);
    }
  }
  const [type, setType] = useState<ModelType>("incheon");
  const [seed, setSeed] = useState(42),
    [count, setCount] = useState(180),
    [uncertainty, setUncertainty] = useState(6);
  const [challenger, setChallenger] = useState<"rl" | "rule" | "random">("rl");
  const [custom, setCustom] = useState<Scenario | null>(null);
  const [error, setError] = useState("");
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const [heatmap, setHeatmap] = useState(true),
    [routes, setRoutes] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const uploadRevision = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    for (const [filename, set] of [
      ["policy.json", setPolicy],
      ["policy-airport.json", setAirportPolicy],
    ] as const) {
      fetch(`${import.meta.env.BASE_URL}${filename}`, {
        signal: controller.signal,
      })
        .then((r) => {
          if (!r.ok) throw new Error("학습 정책을 불러오지 못했습니다.");
          return r.json();
        })
        .then((p) => set(parsePolicy(p)))
        .catch((e) => {
          if (e.name !== "AbortError") {
            setPolicyError(String(e.message));
            setChallenger("rule");
          }
        });
    }
    return () => controller.abort();
  }, []);
  const scenario = useMemo(
    () =>
      custom ??
      (type === "incheon"
        ? createAirportScenario(
            airportSnapshot,
            floor,
            seed,
            count,
            uncertainty,
          )
        : createScenario(type, seed, count, uncertainty)),
    [custom, type, seed, count, uncertainty, airportSnapshot, floor],
  );
  const activePolicy =
    scenario.layout.spots.length === 80 ? airportPolicy : policy;
  const runs = useMemo(() => {
    const left = simulateTwin(scenario, baseline("nearest", scenario.seed));
    const right = simulateTwin(
      scenario,
      challenger === "rl" && activePolicy
        ? rlStrategy(activePolicy)
        : baseline(challenger === "random" ? "random" : "rule", scenario.seed),
    );
    return [left, right] as const;
  }, [scenario, challenger, activePolicy]);
  const [left, right] = runs;
  const end = Math.max(left.metrics.endTime, right.metrics.endTime, 1);
  useEffect(() => {
    setTime(0);
    setPlaying(false);
    setSelected(null);
  }, [runs]);
  useEffect(() => {
    if (!playing) return;
    let previous = performance.now(),
      id = 0;
    const animate = (now: number) => {
      const elapsed = now - previous;
      previous = now;
      setTime((t) => advanceTime(t, elapsed, speed, end));
      id = requestAnimationFrame(animate);
    };
    id = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(id);
  }, [playing, speed, end]);
  useEffect(() => {
    if (time >= end) setPlaying(false);
  }, [time, end]);
  const seek = (value: number) => {
    setTime(Math.max(0, Math.min(end, Number.isFinite(value) ? value : 0)));
    setPlaying(false);
  };
  const complete = time >= end;
  const selectedTrips = runs.map((r) =>
    r.trips.find((t) => t.vehicleId === selected),
  );
  const arrived = frameAt(left, time).arrived;
  async function uploadCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const revision = ++uploadRevision.current;
    try {
      if (file.size > 1_000_000)
        throw new Error("CSV 파일은 1MB 이하로 선택하세요.");
      const next = scenarioFromCsv(await file.text(), file.name, seed);
      if (revision !== uploadRevision.current) return;
      if (next.vehicles.length > 300)
        throw new Error("웹 CSV는 최대 300대까지 지원합니다.");
      if (next.observationEnd > 2000)
        throw new Error(
          "웹 CSV의 도착 시각과 체류시간 합은 1,970 tick 이하여야 합니다.",
        );
      // Validate and drain before committing the uploaded scenario to React state.
      simulateTwin(next, baseline("nearest"), false);
      setCustom(next);
      setError("");
    } catch (e) {
      if (revision === uploadRevision.current)
        setError(e instanceof Error ? e.message : String(e));
    }
    event.target.value = "";
  }
  function exportCsv() {
    const headers = [
      "strategy",
      "vehicleId",
      "initial",
      "spotId",
      "arrivalTime",
      "parkedAt",
      "departureRequestedAt",
      "leftSpotAt",
      "exitedAt",
      "waitingTicks",
      "distance",
    ];
    const cell = (v: unknown) => {
      let value = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
      return `"${value.replaceAll('"', '""')}"`;
    };
    const rows = runs.flatMap((r) =>
      r.trips.map((t) =>
        [
          r.strategy,
          t.vehicleId,
          Boolean(t.initial),
          t.spotId,
          t.arrivalTime,
          t.parkedAt,
          t.departureRequestedAt,
          t.leftSpotAt,
          t.exitedAt,
          t.waitingTicks,
          t.distance,
        ]
          .map(cell)
          .join(","),
      ),
    );
    download(
      "parking-comparison.csv",
      [headers.join(","), ...rows].join("\r\n"),
      "text/csv",
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-icon">P</span>
          <span>
            Parking<span className="brand-light">Twin</span>
          </span>
        </a>
        <div className="sidebar-section">WORKSPACE</div>
        <div className="nav-active">
          <span>◫</span> 시뮬레이션
        </div>
        <div className="sidebar-note">
          <span className="tiny-status" />
          SIMULATION ENGINE v0.3
          <br />
          <p>
            합성 수요 기반
            <br />
            알고리즘 평가 플랫폼
          </p>
        </div>
        <div className="sidebar-bottom">
          GRADUATION PROJECT
          <br />
          <strong>2026 · DIGITAL TWIN</strong>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span> Simulation Lab
          </div>
          <span className="header-tag">
            <i /> REPRODUCIBLE EXPERIMENT
          </span>
        </header>
        <section className="intro">
          <div>
            <div className="eyebrow">PARKING INTELLIGENCE / DIGITAL TWIN</div>
            <h1>
              공간을 읽고, 흐름을 설계하다<span className="title-dot">.</span>
            </h1>
            <p>
              실제 관측 데이터와 학습 정책으로 탐색하는 입체 주차 시뮬레이션.
            </p>
          </div>
          <button
            className="outline"
            onClick={() =>
              download(
                "parking-results.json",
                JSON.stringify(
                  {
                    schemaVersion: 1,
                    scenario,
                    policyTraining: activePolicy?.training ?? null,
                    model: `one-way-${scenario.layout.spots.length}-v1`,
                    results: runs.map(({ frames: _, ...r }) => r),
                  },
                  null,
                  2,
                ),
              )
            }
          >
            ↓ 결과 JSON
          </button>
        </section>
        <section className="configuration panel" aria-label="실험 설정">
          <div className="config-row">
            <label>
              수요 시나리오
              <select
                aria-label="수요 시나리오"
                value={custom ? "csv" : type}
                onChange={(e) => {
                  uploadRevision.current++;
                  setCustom(null);
                  setType(e.target.value as ModelType);
                  setError("");
                }}
              >
                {custom && <option value="csv">{custom.title}</option>}
                <option value="incheon">인천공항 T1 · 공식 데이터</option>
                {scenarioTypes.map((t) => (
                  <option key={t} value={t}>
                    {createScenario(t).title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              비교 전략
              <select
                aria-label="비교 전략"
                value={challenger}
                onChange={(e) =>
                  setChallenger(e.target.value as typeof challenger)
                }
              >
                <option value="rl" disabled={!activePolicy}>
                  DQN / RL{" "}
                  {policyError
                    ? "(불러오기 실패)"
                    : !activePolicy
                      ? "(로딩 중)"
                      : ""}
                </option>
                <option value="rule">Rule-based</option>
                <option value="random">Random</option>
              </select>
            </label>
            <label>
              수요 규모
              <select
                aria-label="수요 규모"
                disabled={!!custom}
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                <option value="35">저수요 · 35대</option>
                <option value="70">기본 · 70대</option>
                <option value="110">고수요 · 110대</option>
                <option value="180">공항 수요 · 180대</option>
              </select>
            </label>
            <label>
              예측 오차
              <select
                aria-label="예측 오차"
                disabled={!!custom}
                value={uncertainty}
                onChange={(e) => setUncertainty(Number(e.target.value))}
              >
                <option value="0">정확 · ±0 tick</option>
                <option value="6">보통 · ±6 tick</option>
                <option value="20">높음 · ±20 tick</option>
              </select>
            </label>
            <label>
              실험 seed
              <input
                aria-label="실험 seed"
                type="number"
                min="0"
                max="999999"
                value={seed}
                disabled={!!custom}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (
                    Number.isSafeInteger(value) &&
                    value >= 0 &&
                    value <= 999999
                  )
                    setSeed(value);
                }}
              />
            </label>
            <button onClick={() => upload.current?.click()}>
              ↑ CSV 업로드
            </button>
            <input
              ref={upload}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={uploadCsv}
            />
          </div>
          <div className="config-caption">
            <span className="tag">
              {custom
                ? "CSV INPUT"
                : type === "incheon"
                  ? "OFFICIAL + MODEL"
                  : "SYNTHETIC"}
            </span>
            <p>{scenario.description}</p>
            <button
              className="text-button"
              onClick={() =>
                download(
                  "vehicles-template.csv",
                  "vehicleId,arrivalTime,duration\nCAR-001,0,30\nCAR-002,2,20\n",
                  "text/csv",
                )
              }
            >
              CSV 양식 ↓
            </button>
          </div>
          {(error || policyError) && (
            <div role="alert" className="error-message">
              {error || policyError}
            </div>
          )}
        </section>
        {type === "incheon" && !custom && (
          <AirportDataPanel
            snapshot={airportSnapshot}
            floor={floor}
            onFloor={setFloor}
            loading={dataLoading}
            mode={dataMode}
            error={dataError}
            onRefresh={refreshAirport}
          />
        )}
        <section className="overview" aria-label="실험 개요">
          <article>
            <span>입력 차량</span>
            <strong>
              {scenario.vehicles.length}
              <small>대</small>
            </strong>
            <p>현재 {arrived}대 도착</p>
          </article>
          <article>
            <span>주차 공간</span>
            <strong>
              {scenario.layout.spots.length}
              <small>면</small>
            </strong>
            <p>
              {scenario.initialParked?.length ?? 0}대 초기 점유 ·{" "}
              {new Set(scenario.layout.spots.map((s) => s.zone)).size}개 구역
            </p>
          </article>
          <article>
            <span>관측 구간</span>
            <strong>
              {scenario.observationEnd}
              <small>tick</small>
            </strong>
            <p>잔여 차량은 출차까지 계산</p>
          </article>
          <article>
            <span>강화학습 정책</span>
            <strong>
              {activePolicy ? activePolicy.training.episodes : "—"}
              <small>episodes</small>
            </strong>
            <p>
              {activePolicy
                ? `${scenario.layout.spots.length}면 정책 · ${activePolicy.training.selectedEpisode}회차 선택`
                : "정책 불러오는 중"}
            </p>
          </article>
        </section>
        <section className="simulation-section">
          <div className="section-heading">
            <h2>
              시뮬레이션 스튜디오 <span>ORTHOGRAPHIC VIEW</span>
            </h2>
            <div className="studio-options">
              <div className="view-switch">
                <button
                  aria-pressed={viewMode === "focus"}
                  onClick={() => setViewMode("focus")}
                >
                  ◈ 몰입 보기
                </button>
                <button
                  aria-pressed={viewMode === "compare"}
                  onClick={() => setViewMode("compare")}
                >
                  ◫ 분할 비교
                </button>
              </div>
              <button
                className="light-switch"
                onClick={() => setNight((v) => !v)}
                aria-label="조명 전환"
              >
                {night ? "☾ 야간" : "☀ 주간"}
              </button>
            </div>
          </div>
          <div className="studio-toolbar">
            <span>
              {scenario.title}
              <b> · </b>
              {labels[right.strategy]}
            </span>
            <div className="layer-options">
              <label>
                <input
                  type="checkbox"
                  checked={routes}
                  onChange={(e) => setRoutes(e.target.checked)}
                />
                선택 차량 경로
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={heatmap}
                  onChange={(e) => setHeatmap(e.target.checked)}
                />
                통로 혼잡
              </label>
            </div>
          </div>
          <div
            className={`comparison-grid ${viewMode === "focus" ? "focus-mode" : ""}`}
          >
            {runs.map((result, index) =>
              viewMode === "focus" && index === 0 ? null : (
                <RunPanel
                  key={index}
                  result={result}
                  index={index}
                  time={time}
                  selected={selected}
                  onSelect={setSelected}
                  heatmap={heatmap}
                  routes={routes}
                  night={night}
                />
              ),
            )}
          </div>
          <section className="playback panel" aria-label="공통 재생 제어">
            <div className="playback-top">
              <div className="controls">
                <button
                  className="primary"
                  aria-label={
                    playing ? "일시정지" : complete ? "다시 재생" : "재생"
                  }
                  onClick={() => {
                    if (complete) setTime(0);
                    setPlaying((p) => !p);
                  }}
                  disabled={challenger === "rl" && !activePolicy}
                >
                  {playing ? "Ⅱ 일시정지" : complete ? "↻ 다시 재생" : "▶ 재생"}
                </button>
                <button onClick={() => seek(0)}>초기화</button>
                <button
                  disabled={complete}
                  onClick={() => seek(Math.min(end, Math.floor(time) + 1))}
                >
                  한 단계 →
                </button>
                <label className="speed">
                  배속
                  <select
                    aria-label="재생 속도"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  >
                    {[1, 2, 4, 8].map((s) => (
                      <option key={s} value={s}>
                        {s}×
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="time-readout">
                <span className={playing ? "playing" : ""}>
                  {complete ? "완료" : playing ? "재생 중" : "일시정지"}
                </span>
                <strong>
                  {fmt(time, 0)}
                  <small> / {end} tick</small>
                </strong>
              </div>
            </div>
            <input
              className="time-slider"
              type="range"
              aria-label="시뮬레이션 시간"
              min="0"
              max={end}
              step="0.25"
              value={time}
              onChange={(e) => seek(Number(e.target.value))}
            />
            <div className="chart-heading">
              <span>점유·대기 타임라인</span>
              <div>
                <i className="baseline-dot" />
                Nearest 점유 <i className="rl-dot" />
                {labels[right.strategy]} 점유 <i className="queue-dot" />
                비교 전략 대기
              </div>
            </div>
            <Timeline
              left={left}
              right={right}
              time={time}
              end={end}
              onSeek={seek}
            />
          </section>
        </section>
        <div className="analysis-grid">
          <section className="panel results">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">PERFORMANCE</div>
                <h2>실행 결과</h2>
                <p>
                  {complete
                    ? "모든 차량의 출차까지 계산한 최종 지표입니다."
                    : "전체 실행의 계산 결과입니다. 재생은 위 상태만 변경합니다."}
                </p>
              </div>
              <button onClick={exportCsv}>↓ 차량별 CSV</button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>지표</th>
                    <th>Nearest</th>
                    <th>{labels[right.strategy]}</th>
                    <th>차이</th>
                  </tr>
                </thead>
                <tbody>
                  {metricRows.map((row) => {
                    const a = left.metrics[row.key],
                      b = right.metrics[row.key],
                      delta = b - a;
                    return (
                      <tr key={row.key}>
                        <td>
                          {row.label}
                          <small>{row.unit}</small>
                        </td>
                        <td>{fmt(a)}</td>
                        <td>{fmt(b)}</td>
                        <td
                          className={
                            row.lower && delta < -0.05
                              ? "better"
                              : row.lower && delta > 0.05
                                ? "worse"
                                : ""
                          }
                        >
                          {Math.abs(delta) < 0.05
                            ? "—"
                            : `${delta > 0 ? "+" : ""}${fmt(delta)}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="result-note">
              시간·거리는 배정 차량 기준 · 미배정률과 함께 해석하세요.
              <br />
              비용 = 이동 + 주차 조작 + 통로 대기 + 미배정 × 30 · 낮을수록 유리
            </p>
          </section>
          <section className="panel details">
            <div className="panel-heading">
              <div>
                <div className="eyebrow">VEHICLE INSPECTOR</div>
                <h2>차량 상세</h2>
              </div>
              {selected && (
                <button
                  aria-label="차량 선택 해제"
                  onClick={() => setSelected(null)}
                >
                  ×
                </button>
              )}
            </div>
            <div className="inspector-picker">
              <label htmlFor="vehicle-select">차량 선택</label>
              <select
                id="vehicle-select"
                aria-label="차량 선택"
                value={selected ?? ""}
                onChange={(e) => setSelected(e.target.value || null)}
              >
                <option value="">지도 또는 목록에서 선택</option>
                {right.trips
                  .filter((t) => t.arrivalTime <= time)
                  .map((t) => (
                    <option key={t.vehicleId} value={t.vehicleId}>
                      {t.vehicleId}
                      {t.initial ? " · 초기 주차" : ""}
                    </option>
                  ))}
              </select>
            </div>
            {!selected ? (
              <div className="empty-inspector">
                <div>⌖</div>
                <h3>차량의 선택을 따라가세요</h3>
                <p>
                  지도에서 차량이나 예약된 주차면을 선택하면
                  <br />두 전략의 배정과 이동 정보를 비교할 수 있습니다.
                </p>
              </div>
            ) : (
              <div className="inspector-content">
                <h3>{selected}</h3>
                {runs.map((run, i) => {
                  const trip = selectedTrips[i];
                  const visible = trip && trip.arrivalTime <= time;
                  const current = frameAt(run, time).vehicles.find(
                    (v) => v.vehicleId === selected,
                  );
                  return (
                    <div className="trip-detail" key={i}>
                      <h4>
                        {labels[run.strategy]}
                        <span className="tag">
                          {!visible
                            ? "도착 예정"
                            : current
                              ? `${phaseLabels[current.phase]}${current.waiting ? " · 대기" : ""}`
                              : phaseLabels[trip.phase]}
                        </span>
                      </h4>
                      <dl>
                        <div>
                          <dt>배정 위치</dt>
                          <dd>
                            {visible
                              ? trip.spotId === null
                                ? "미배정"
                                : `P${String(trip.spotId).padStart(2, "0")}`
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>도착 / 예상 출차</dt>
                          <dd>
                            {trip
                              ? `${trip.arrivalTime} / ${trip.estimatedDeparture}`
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>주차 완료 / 실제 출구 도달</dt>
                          <dd>
                            {visible
                              ? `${trip.parkedAt !== null && trip.parkedAt <= time ? trip.parkedAt : "—"} / ${trip.exitedAt !== null && trip.exitedAt <= time ? trip.exitedAt : "—"}`
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt>통로 대기 합계</dt>
                          <dd>
                            {trip?.exitedAt !== null &&
                            trip?.exitedAt !== undefined &&
                            trip.exitedAt <= time
                              ? `${trip.waitingTicks} tick`
                              : "출차 후 표시"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
        <section className="model-note">
          <strong>모델을 이해하고 결과를 읽어주세요.</strong>
          <p>
            {scenario.provenance
              ? "인천공항 공식 점유율과 잔여 대수로 초기화한 축소 실험입니다. 개별 차량 기록과 정밀 도면을 재현한 것은 아닙니다."
              : "입·출차 패턴을 구성한 합성 실험입니다."}{" "}
            시간은 추상 tick이며 통로 용량과 FIFO 대기로 혼잡을 계산합니다. 입체
            차량과 주차 동작은 엔진 궤적의 시각적 보간이며, 차간거리·교차로
            충돌까지 계산하는 미시 교통 모델은 아닙니다. RL의 우수성을 보장하지
            않습니다.
          </p>
        </section>
        <footer>
          <span>Parking Twin · Algorithm Evaluation Platform</span>
          <span>동일 seed, 동일 수요, 재현 가능한 비교.</span>
        </footer>
      </main>
    </div>
  );
}
