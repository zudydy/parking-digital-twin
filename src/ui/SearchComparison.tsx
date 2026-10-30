import type { TwinResult } from "../twin/model.js";
import { fmt, frameAt, labels } from "./presentation.js";
export function SearchComparison({
  left,
  right,
  time,
  selected,
  onSelect,
  onSeek,
}: {
  left: TwinResult;
  right: TwinResult;
  time: number;
  selected: string | null;
  onSelect: (id: string) => void;
  onSeek: (time: number) => void;
}) {
  if (left.strategy !== "search") return null;
  const searching = left.strategy === "search" ? left : null;
  const loop = searching?.trips.find((t) => t.searchLaps > 0);
  const own = searching?.trips.find((t) => t.vehicleId === selected);
  const checks =
    searching?.searchChecks.filter(
      (c) => c.vehicleId === selected && c.time <= time,
    ) ?? [];
  const matched = left.trips
    .filter((t) => !t.initial && t.parkedAt !== null)
    .flatMap((a) => {
      const b = right.trips.find(
        (t) => t.vehicleId === a.vehicleId && t.parkedAt !== null,
      );
      return b ? [{ a, b }] : [];
    });
  const delta = matched.length
    ? matched.reduce(
        (sum, { a, b }) =>
          sum + (b.parkedAt! - b.arrivalTime) - (a.parkedAt! - a.arrivalTime),
        0,
      ) / matched.length
    : 0;
  return (
    <section className="panel search-comparison">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">SEARCH / GUIDANCE</div>
          <h2>직접 찾는 시간과 안내의 효과</h2>
          <p>
            무안내 차량은 도달한 자리만 확인합니다. Nearest는 빈자리를 알고
            예약하는 안내 전략입니다.
          </p>
        </div>
        {loop && (
          <button
            onClick={() => {
              onSelect(loop.vehicleId);
              const leg = loop.segments.find((s) =>
                s.edgeId.includes("search-south-east"),
              );
              onSeek(leg?.start ?? loop.arrivalTime);
            }}
          >
            순환 탐색 사례 보기 →
          </button>
        )}
      </div>
      <div className="search-kpis">
        <article>
          <span>현재 직접 탐색 중</span>
          <strong>
            {searching
              ? frameAt(searching, time).vehicles.filter(
                  (v) => v.phase === "searching",
                ).length
              : 0}
            <small>대</small>
          </strong>
        </article>
        <article>
          <span>무안내 평균 탐색 시간 · 전체 결과</span>
          <strong>
            {fmt(searching?.metrics.averageSearchTime ?? 0)}
            <small>tick</small>
          </strong>
        </article>
        <article>
          <span>공통 주차 성공 차량의 주차시간 차이</span>
          <strong>
            {fmt(delta, 2)}
            <small>tick</small>
          </strong>
        </article>
      </div>
      <p className="result-note">
        주차시간 차이 = {labels[right.strategy]} − {labels[left.strategy]} ·
        양쪽에서 주차한 {matched.length}대만 대응 비교합니다. 실패·입장 거절
        차량도 아래 미배정률과 함께 확인하세요. 탐색 시간은 입장부터 자리
        발견까지 이동·대기를 포함하며, 우회거리는 최종 자리로의 최단 입차 경로를
        초과한 거리입니다.
      </p>
      {searching && (
        <div className="search-trace">
          <label>
            직접 탐색 차량
            <select
              aria-label="직접 탐색 차량"
              value={own?.vehicleId ?? ""}
              onChange={(e) => {
                const t = searching.trips.find(
                  (t) => t.vehicleId === e.target.value,
                );
                if (t) {
                  onSelect(t.vehicleId);
                  onSeek(t.arrivalTime);
                }
              }}
            >
              <option value="">차량을 선택해 현장 확인 기록 보기</option>
              {searching.trips
                .filter((t) => t.searchStartedAt !== null)
                .map((t) => (
                  <option key={t.vehicleId} value={t.vehicleId}>
                    {t.vehicleId}
                  </option>
                ))}
            </select>
          </label>
          <div className="search-checks">
            {own
              ? checks.length
                ? checks.slice(-12).map((c, i) => (
                    <span
                      key={`${c.time}-${i}`}
                      className={c.available ? "found-space" : ""}
                    >
                      t={c.time} · P{String(c.spotId).padStart(2, "0")}{" "}
                      {c.available ? "발견·주차" : "점유·통과"}
                    </span>
                  ))
                : "이 시점까지 확인한 자리가 없습니다."
              : "전역 빈자리 정보를 사용하지 않고 실제 통과한 자리만 기록합니다."}
          </div>
        </div>
      )}
    </section>
  );
}
