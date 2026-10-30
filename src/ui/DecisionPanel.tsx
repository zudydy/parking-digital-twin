import type { TwinResult } from "../twin/model.js";
import { fmt } from "./presentation.js";
export function DecisionPanel({
  result,
  time,
  selected,
  onSelect,
  onSeek,
}: {
  result: TwinResult;
  time: number;
  selected: string | null;
  onSelect: (id: string) => void;
  onSeek: (time: number) => void;
}) {
  const decision =
    result.decisions.find((d) => d.vehicleId === selected) ??
    [...result.decisions].reverse().find((d) => d.time <= time);
  const available =
    decision?.observation.candidates.filter((c) => c.available) ?? [];
  let ranked = [...available]
    .sort((a, b) =>
      decision?.qValues
        ? decision.qValues[b.spotId - 1]! - decision.qValues[a.spotId - 1]!
        : a.inboundDistance - b.inboundDistance || a.spotId - b.spotId,
    )
    .slice(0, 5);
  const chosen = available.find((c) => c.spotId === decision?.spotId);
  if (chosen && !ranked.some((c) => c.spotId === chosen.spotId))
    ranked = [...ranked.slice(0, 4), chosen];
  return (
    <section className="panel decision-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">DECISION INSPECTOR</div>
          <h2>이 자리를 선택한 순간</h2>
          <p>배정 직전의 관찰값과 가용 후보를 확인합니다.</p>
        </div>
        <select
          aria-label="배정 의사결정"
          value={decision?.vehicleId ?? ""}
          onChange={(e) => {
            const d = result.decisions.find(
              (d) => d.vehicleId === e.target.value,
            );
            if (d) {
              onSelect(d.vehicleId);
              onSeek(d.time);
            }
          }}
        >
          <option value="">도착 차량 선택</option>
          {result.decisions.map((d) => (
            <option key={d.vehicleId} value={d.vehicleId}>
              {d.vehicleId} · t={d.time}
            </option>
          ))}
        </select>
      </div>
      {!decision ? (
        <div className="decision-empty">
          첫 차량이 도착하면 배정 시점의 상태가 표시됩니다.
        </div>
      ) : (
        <>
          <div className="decision-summary">
            <span>{decision.vehicleId}</span>
            <strong>P{String(decision.spotId).padStart(2, "0")}</strong>
            <span>t={decision.time}</span>
            <span>
              {decision.featureMode === "no-departure"
                ? "출차정보 제외 정책"
                : "예상 출차정보 사용"}
            </span>
            <button
              onClick={() => {
                onSelect(decision.vehicleId);
                onSeek(decision.time);
              }}
            >
              배정 시점으로 이동 →
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>후보</th>
                  <th>입차 거리</th>
                  <th>출차 거리</th>
                  <th>관련 통로 대기</th>
                  <th>예상 출차 집중</th>
                  <th>Q 추정값</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((c) => (
                  <tr
                    className={c.spotId === decision.spotId ? "chosen-row" : ""}
                    key={c.spotId}
                  >
                    <td>
                      P{String(c.spotId).padStart(2, "0")}
                      {c.spotId === decision.spotId ? " · 선택" : ""}
                    </td>
                    <td>{c.inboundDistance}</td>
                    <td>{c.outboundDistance}</td>
                    <td>{c.queue}</td>
                    <td>
                      {decision.featureMode === "no-departure"
                        ? "입력 제외"
                        : c.departurePressure}
                    </td>
                    <td>
                      {decision.qValues
                        ? fmt(decision.qValues[c.spotId - 1]!, 3)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="result-note">
            배정 당시 사용할 수 있었던 정보만 표시합니다. Q값은 학습한 누적
            보상의 추정치이며, 선택 이유의 인과적 설명이나 성공 확률이 아닙니다.
            출차정보 제외 정책은 해당 입력을 제거한 상태로 별도 학습했습니다.
          </p>
        </>
      )}
    </section>
  );
}
