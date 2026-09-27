import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createParkingSpots,
  simulateParking,
  type Assignment,
  type Vehicle,
} from "./simulation.js";
import "./web.css";

// CLI와 동일한 샘플을 사용합니다. 이 파일은 정해진 형식의 내장 데이터입니다.
import sampleCsv from "../data/vehicles.csv?raw";
const sample: Vehicle[] = sampleCsv
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const [vehicleId = "", arrivalTime, duration] = line.split(",");
    return {
      vehicleId,
      arrivalTime: Number(arrivalTime),
      duration: Number(duration),
    };
  });
const fullLot: Vehicle[] = Array.from({ length: 24 }, (_, index) => ({
  vehicleId: `CAR-${String(index + 1).padStart(3, "0")}`,
  arrivalTime: index < 22 ? Math.floor(index / 4) : 12,
  duration: 10,
}));
const scenarios = {
  sample: { title: "기본 입·출차", vehicles: sample },
  full: { title: "만차 시나리오", vehicles: fullLot },
};
const spots = createParkingSpots();

function status(assignment: Assignment, time: number): string {
  if (time < assignment.arrivalTime) return "도착 예정";
  if (assignment.spotId === null) return "미배정";
  return time < assignment.departureTime! ? "주차 중" : "출차 완료";
}

function App() {
  const [scenario, setScenario] = useState<keyof typeof scenarios>("sample");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const result = simulateParking(scenarios[scenario].vehicles);
  const end = Math.max(
    ...result.assignments.map((a) => a.departureTime ?? a.arrivalTime),
  );
  const parked = result.assignments.filter(
    (a) => status(a, time) === "주차 중",
  );
  const arrived = result.assignments.filter((a) => a.arrivalTime <= time);
  const rejected = arrived.filter((a) => a.spotId === null).length;
  const finished = time === end;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => setTime((value) => Math.min(end, value + 1)),
      1000 / speed,
    );
    return () => window.clearInterval(timer);
  }, [playing, speed, end]);
  useEffect(() => {
    if (time === end) setPlaying(false);
  }, [time, end]);

  return (
    <main>
      <header>
        <a className="brand" href="/">
          P<span>Parking Lab</span>
        </a>
        <span className="header-note">졸업작품 · 중간 프로토타입</span>
        <span className="version">NEAREST / v0.2</span>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">PARKING SIMULATION</p>
          <h1>주차의 흐름을 한눈에.</h1>
          <p>
            차량이 도착하고, 가까운 빈자리를 찾고, 다시 떠나는 과정을
            살펴보세요.
          </p>
        </div>
        <label className="scenario">
          시나리오
          <select
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value as keyof typeof scenarios);
              setTime(0);
              setPlaying(false);
            }}
          >
            <option value="sample">기본 입·출차 · 8대</option>
            <option value="full">만차 시나리오 · 24대</option>
          </select>
        </label>
      </section>
      <section className="metrics" aria-label="현재 시뮬레이션 지표">
        <article>
          <span>현재 점유율</span>
          <strong>
            {parked.length * 5}
            <small>%</small>
          </strong>
          <div className="meter">
            <i style={{ width: `${parked.length * 5}%` }} />
          </div>
        </article>
        <article>
          <span>주차 중인 차량</span>
          <strong>
            {parked.length}
            <small>/ 20면</small>
          </strong>
          <p>빈 주차면 {20 - parked.length}개</p>
        </article>
        <article>
          <span>도착한 차량</span>
          <strong>
            {arrived.length}
            <small>/ {result.totalVehicles}대</small>
          </strong>
          <p>입력 데이터 기준</p>
        </article>
        <article>
          <span>미배정 차량</span>
          <strong>
            {rejected}
            <small>대</small>
          </strong>
          <p>만차 시 대기 없이 통과</p>
        </article>
      </section>
      <section className="workspace">
        <div className="panel parking-panel">
          <div className="panel-heading">
            <div>
              <h2>주차장 현황</h2>
              <p>4 × 5 격자 · 총 20면</p>
            </div>
            <div className="legend">
              <span>
                <i />
                빈자리
              </span>
              <span>
                <i className="occupied-dot" />
                주차 중
              </span>
            </div>
          </div>
          <div className="lot">
            <div className="entrance">
              입구 <span>→</span>
              <small>(0, 0)</small>
            </div>
            <div className="parking-grid">
              {spots.map((spot) => {
                const vehicle = parked.find((a) => a.spotId === spot.id);
                return (
                  <div
                    key={spot.id}
                    className={`spot ${vehicle ? "occupied" : ""}`}
                    aria-label={`${spot.id}번 주차면 ${vehicle ? vehicle.vehicleId : "빈자리"}`}
                  >
                    <span className="spot-number">
                      P{String(spot.id).padStart(2, "0")}
                    </span>
                    {vehicle ? (
                      <>
                        <span className="car" aria-hidden="true">
                          ▰
                        </span>
                        <strong>{vehicle.vehicleId}</strong>
                        <small>t={vehicle.departureTime} 출차</small>
                      </>
                    ) : (
                      <>
                        <span className="empty-mark">—</span>
                        <small>거리 {spot.distance}</small>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="lot-caption">
              입구 기준 맨해튼 거리 · 같은 거리라면 낮은 번호 우선
            </div>
          </div>
          <div className="playback">
            <div className="time-label">
              <span className={`state ${playing ? "live" : ""}`}>
                {finished
                  ? "시뮬레이션 완료"
                  : playing
                    ? "재생 중"
                    : "일시정지"}
              </span>
              <strong>
                t = {time}
                <small> / {end}</small>
              </strong>
            </div>
            <input
              aria-label="시뮬레이션 시간"
              type="range"
              min="0"
              max={end}
              value={time}
              onChange={(event) => {
                setTime(Number(event.target.value));
                setPlaying(false);
              }}
            />
            <div className="controls">
              <button
                className="primary"
                onClick={() => {
                  if (finished) setTime(0);
                  setPlaying(!playing);
                }}
              >
                {playing ? "Ⅱ 일시정지" : finished ? "▶ 다시 재생" : "▶ 재생"}
              </button>
              <button
                onClick={() => {
                  setTime(0);
                  setPlaying(false);
                }}
              >
                초기화
              </button>
              <button
                disabled={finished}
                onClick={() => {
                  setPlaying(false);
                  setTime(Math.min(end, time + 1));
                }}
              >
                한 단계 →
              </button>
              <label className="speed">
                재생 속도
                <select
                  aria-label="재생 속도"
                  value={speed}
                  onChange={(event) => setSpeed(Number(event.target.value))}
                >
                  <option value="1">1×</option>
                  <option value="2">2×</option>
                  <option value="4">4×</option>
                </select>
              </label>
            </div>
          </div>
        </div>
        <aside className="panel">
          <p className="eyebrow">HOW IT WORKS</p>
          <h2>
            가장 가까운
            <br />
            빈자리부터.
          </h2>
          <p className="explanation">
            Nearest 알고리즘은 차량이 도착하는 순간, 비어 있는 주차면 중
            입구에서 가장 가까운 곳을 배정합니다.
          </p>
          <ol>
            <li>
              <span>01</span>도착 시각에 차량 입차
            </li>
            <li>
              <span>02</span>가까운 빈 주차면 선택
            </li>
            <li>
              <span>03</span>주차 시간이 지나면 출차
            </li>
          </ol>
          <div className="formula">
            이동거리 = 행 + 열<small>입구 (0, 0) 기준 편도 거리</small>
          </div>
          <p className="note">
            같은 시각에는 출차를 먼저 처리합니다. 화면의 격자는 거리 모델이며
            실제 도로 경로를 나타내지는 않습니다.
          </p>
        </aside>
      </section>
      <section className="panel results">
        <div className="panel-heading">
          <div>
            <h2>시뮬레이션 결과</h2>
            <p>
              {finished
                ? "모든 차량의 처리가 끝났습니다."
                : "재생이 끝나면 최종 지표가 표시됩니다."}
            </p>
          </div>
          <span className="version">{scenarios[scenario].title}</span>
        </div>
        <div className="result-metrics">
          <div>
            총 차량 수
            <strong>{finished ? `${result.totalVehicles}대` : "—"}</strong>
          </div>
          <div>
            평균 이동거리
            <strong>
              {finished ? result.averageDistance.toFixed(2) : "—"}
            </strong>
          </div>
          <div>
            평균 점유율
            <strong>
              {finished ? `${result.averageOccupancyRate.toFixed(2)}%` : "—"}
            </strong>
          </div>
        </div>
        <p className="note">
          평균 이동거리는 배정 차량 기준 · 평균 점유율은 전체 시뮬레이션 구간의
          시간가중 평균
        </p>
      </section>
      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>차량별 배정 기록</h2>
            <p>시간을 이동하면 차량 상태도 함께 바뀝니다.</p>
          </div>
          <span className="count">{result.totalVehicles} vehicles</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>차량 ID</th>
                <th>도착</th>
                <th>주차 시간</th>
                <th>출차</th>
                <th>배정 주차면</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {result.assignments.map((a) => (
                <tr key={a.vehicleId}>
                  <td>{a.vehicleId}</td>
                  <td>{a.arrivalTime}</td>
                  <td>
                    {
                      scenarios[scenario].vehicles.find(
                        (v) => v.vehicleId === a.vehicleId,
                      )?.duration
                    }
                  </td>
                  <td>
                    {a.arrivalTime <= time ? (a.departureTime ?? "—") : "—"}
                  </td>
                  <td>
                    {a.arrivalTime > time
                      ? "—"
                      : a.spotId === null
                        ? "미배정"
                        : `P${String(a.spotId).padStart(2, "0")}`}
                  </td>
                  <td>
                    <span
                      className={`badge ${status(a, time) === "주차 중" ? "active" : status(a, time) === "미배정" ? "rejected" : ""}`}
                    >
                      {status(a, time)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <footer>
        Parking Lab<span>TypeScript · React · Nearest</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
