import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeHistory, observedSeries } from "../data/history.js";
import {
  validateSnapshot,
  type AirportSnapshot,
  type FloorId,
} from "../data/incheon.js";
import { createAirportScenario } from "../twin/airport.js";
import { simulateTwin } from "../twin/engine.js";
import { withSearchCirculation } from "../twin/search.js";
import { baseline } from "../twin/strategies.js";
import { frameAt, fmt } from "./presentation.js";
import { download } from "./download.js";
export function ObservationPanel() {
  const [history, setHistory] = useState<AirportSnapshot[]>([]),
    [floor, setFloor] = useState<FloorId>("ground"),
    [tickMinutes, setTickMinutes] = useState(1),
    [collecting, setCollecting] = useState(false),
    [error, setError] = useState("");
  const busy = useRef(false);
  const load = useCallback(async () => {
    try {
      let observations: AirportSnapshot[] = [];
      try {
        const response = await fetch("/api/incheon/history", {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("서버 이력 없음");
        const payload = await response.json();
        if (!Array.isArray(payload.history)) throw new Error("이력 형식 오류");
        observations = normalizeHistory(payload.history);
      } catch {
        /* Static hosting uses the frozen observed series. */
      }
      if (!observations.length) {
        const response = await fetch(
          `${import.meta.env.BASE_URL}data/incheon-history.json`,
        );
        if (!response.ok) throw new Error("관측 이력을 읽지 못했습니다.");
        const payload = await response.json();
        if (!Array.isArray(payload.history))
          throw new Error("관측 이력 형식이 다릅니다.");
        observations = normalizeHistory(payload.history);
      }
      setHistory(observations);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const collect = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const response = await fetch("/api/incheon", {
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          "공식 관측을 수집하지 못했습니다. 기존 관측을 유지합니다.",
        );
      validateSnapshot(await response.json());
      await load();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busy.current = false;
    }
  }, [load]);
  useEffect(() => {
    if (!collecting) return;
    void collect();
    const interval = window.setInterval(() => void collect(), 60000);
    return () => window.clearInterval(interval);
  }, [collecting, collect]);
  const series = useMemo(
    () => observedSeries(history, floor),
    [history, floor],
  );
  const result = useMemo(
    () =>
      history[0]
        ? simulateTwin(
            withSearchCirculation(
              createAirportScenario(history[0], floor, 42, 180, 6),
            ),
            baseline("nearest"),
          )
        : null,
    [history, floor],
  );
  const points = useMemo(
    () =>
      result
        ? series
            .filter(
              (p) => p.minute / tickMinutes <= result.metrics.observationEnd,
            )
            .map((p) => ({
              ...p,
              predicted:
                (frameAt(result, p.minute / tickMinutes).occupied.length / 80) *
                100,
            }))
        : [],
    [result, series, tickMinutes],
  );
  const mae = points.length
    ? points.reduce(
        (sum, p) => sum + Math.abs(p.predicted - p.occupancyPercent),
        0,
      ) / points.length
    : null;
  const span = series.at(-1)?.minute ?? 0,
    end = Math.max(1, span),
    rangeValues = points.flatMap((p) => [p.predicted, p.occupancyPercent]);
  const min = Math.max(
      0,
      Math.floor((Math.min(...rangeValues, 70) - 5) / 5) * 5,
    ),
    max = Math.min(100, Math.ceil((Math.max(...rangeValues, 80) + 5) / 5) * 5),
    height = Math.max(5, max - min);
  const path = (key: "predicted" | "occupancyPercent") =>
    points
      .map(
        (p) =>
          `${50 + (p.minute / end) * 900},${195 - ((p[key] - min) / height) * 145}`,
      )
      .join(" ");
  return (
    <section className="panel observation-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">OFFICIAL OBSERVATIONS / MODEL CHECK</div>
          <h2>실제 점유 추이와 모델을 나란히</h2>
          <p>
            공식 페이지의 서로 다른 관측 시각을 보존합니다. 개별 차량 입·출차
            기록은 아닙니다.
          </p>
        </div>
        <button
          className={collecting ? "primary" : ""}
          onClick={() => setCollecting((v) => !v)}
        >
          {collecting ? "■ 수집 중지" : "▶ 60초 간격 수집"}
        </button>
      </div>
      <div className="observation-controls">
        <label>
          비교 층
          <select
            aria-label="시계열 비교 층"
            value={floor}
            onChange={(e) => setFloor(e.target.value as FloorId)}
          >
            <option value="ground">지상1층</option>
            <option value="b1">지하1층</option>
            <option value="b2">지하2층</option>
          </select>
        </label>
        <label>
          시간 대응 가정
          <select
            aria-label="tick 시간 가정"
            value={tickMinutes}
            onChange={(e) => setTickMinutes(Number(e.target.value))}
          >
            {[0.5, 1, 2, 5].map((n) => (
              <option key={n} value={n}>
                1 tick = {n}분 (가정)
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => void collect()}>지금 관측 추가</button>
        <button onClick={() => void load()}>이력 새로 읽기</button>
        <button
          onClick={() =>
            download(
              "incheon-observations.json",
              JSON.stringify(
                {
                  schemaVersion: 1,
                  history,
                  comparison: {
                    floor,
                    tickMinutes,
                    seed: 42,
                    vehicleCount: 180,
                    policy: "nearest",
                    points,
                    mae: points.length >= 3 ? mae : null,
                  },
                },
                null,
                2,
              ),
            )
          }
        >
          관측 JSON ↓
        </button>
      </div>
      <div className="observation-kpis">
        <article>
          <span>서로 다른 관측 시각</span>
          <strong>
            {history.length}
            <small>개</small>
          </strong>
        </article>
        <article>
          <span>관측 구간</span>
          <strong>
            {fmt(span, 1)}
            <small>분</small>
          </strong>
        </article>
        <article>
          <span>가정 시간축의 점유율 MAE</span>
          <strong>
            {points.length >= 3 && mae !== null ? fmt(mae, 3) : "자료 부족"}
            <small>{points.length >= 3 ? "%p" : ""}</small>
          </strong>
        </article>
        <article>
          <span>비교 모델</span>
          <strong className="kpi-label">Nearest · 80면</strong>
        </article>
      </div>
      {points.length >= 2 ? (
        <svg
          viewBox="0 0 1000 240"
          className="observation-chart"
          role="img"
          aria-label="공식 관측 점유율과 가정 시간축 모델 점유율 비교"
        >
          {[0, 0.5, 1].map((n) => (
            <g key={n}>
              <line
                x1="50"
                x2="950"
                y1={195 - n * 145}
                y2={195 - n * 145}
                stroke="#e4ebdf"
              />
              <text x="42" y={199 - n * 145} textAnchor="end">
                {fmt(min + n * height, 1)}%
              </text>
            </g>
          ))}
          <polyline
            points={path("occupancyPercent")}
            fill="none"
            stroke="#355d82"
            strokeWidth="2.5"
          />
          <polyline
            points={path("predicted")}
            fill="none"
            stroke="#4b9a72"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          {points.map((p) => (
            <circle
              key={p.updatedAt}
              cx={50 + (p.minute / end) * 900}
              cy={195 - ((p.occupancyPercent - min) / height) * 145}
              r="3"
              fill="#355d82"
            >
              <title>
                {p.updatedAt} · 공식 {p.occupancyPercent}% · 모델{" "}
                {fmt(p.predicted, 2)}%
              </title>
            </circle>
          ))}
          <text x="50" y="225">
            첫 공식 관측부터 경과 시간 · 0분
          </text>
          <text x="950" y="225" textAnchor="end">
            {fmt(span, 1)}분
          </text>
        </svg>
      ) : (
        <div className="decision-empty">
          서로 다른 공식 관측 시각이 2개 이상이면 추이를 표시합니다. MAE는 비교
          가능한 3개 관측부터 계산합니다.
        </div>
      )}
      <p className="result-note">
        <span className="observation-key actual-key" />
        공식 관측 <span className="observation-key model-key" />
        가정 시간축의 시뮬레이션
        <br />첫 관측 점유율로 초기화한 seeded 합성 수요(180대)의 결과를
        비교합니다. 1 tick의 실제 길이는 실측 보정되지 않았으므로, 위 MAE는
        선택한 시간 가정의 기술 통계입니다. 짧은 관측 구간이나 낮은 오차만으로
        모델의 현실 예측력을 입증하지 않습니다. 잔여 대수 변화로 개별
        입·출차량을 역산하지 않습니다. 수집은 이 화면을 열어둔 동안만 실행되며
        동일 관측 시각은 중복 제외합니다.
      </p>
      {error && (
        <p className="airport-warning" role="status">
          {error}
        </p>
      )}
    </section>
  );
}
