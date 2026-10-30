import {
  AIRPORT_URL,
  type AirportSnapshot,
  type FloorId,
} from "../data/incheon.js";
export function AirportDataPanel({
  snapshot,
  floor,
  onFloor,
  loading,
  mode,
  error,
  onRefresh,
}: {
  snapshot: AirportSnapshot;
  floor: FloorId;
  onFloor: (f: FloorId) => void;
  loading: boolean;
  mode: string;
  error: string;
  onRefresh: () => void;
}) {
  const date = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(snapshot.updatedAt));
  return (
    <section className="airport-data">
      <div className="airport-data-heading">
        <div className="airport-code">
          ICN<span>RKSI</span>
        </div>
        <div>
          <span className="eyebrow">INCHEON INTERNATIONAL AIRPORT</span>
          <h2>
            제1여객터미널 <span>단기주차장</span>
          </h2>
          <p>
            공식 관측 {date} KST <b>·</b>{" "}
            {mode === "live" ? "공식 현황 갱신 완료" : "저장된 공식 스냅샷"}
          </p>
        </div>
        <div className="airport-actions">
          <a href={AIRPORT_URL} target="_blank" rel="noreferrer">
            공식 출처 ↗
          </a>
          <button disabled={loading} onClick={onRefresh}>
            {loading ? "갱신 중…" : "↻ 공식 데이터 갱신"}
          </button>
        </div>
      </div>
      <div className="airport-floors">
        {snapshot.floors.map((f) => (
          <button
            key={f.id}
            className={floor === f.id ? "active" : ""}
            aria-pressed={floor === f.id}
            onClick={() => onFloor(f.id)}
          >
            <div>
              <span>{f.name}</span>
              <span className="floor-state">
                {f.occupancyPercent >= 90
                  ? "혼잡"
                  : f.occupancyPercent >= 70
                    ? "보통"
                    : "여유"}
              </span>
            </div>
            <strong>
              {f.available.toLocaleString()}
              <small>대 가능</small>
            </strong>
            <div className="floor-bar">
              <i style={{ width: `${f.occupancyPercent}%` }} />
            </div>
            <p>
              공식 점유율 {f.occupancyPercent}%{" "}
              <span>
                {floor === f.id ? "시뮬레이션 적용 중" : "이 층으로 전환 →"}
              </span>
            </p>
          </button>
        ))}
      </div>
      <div className="airport-disclosure">
        <i>i</i>
        <p>
          공식 <strong>점유율·잔여 대수</strong>를 사용합니다. 화면은{" "}
          <strong>80면 축소 모델</strong>이며, 초기 점유 위치·잔여 체류·후속
          차량 수요와 통로 배치는 모델링한 값입니다.
        </p>
      </div>
      {error && (
        <div className="airport-warning" role="status">
          {error}
        </div>
      )}
    </section>
  );
}
