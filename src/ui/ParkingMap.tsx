import type { Frame, Trip, TwinResult } from "../twin/model.js";
import { frameAt, labels, phaseLabels } from "./presentation.js";
const px = (x: number) => 60 + x * 64;
const py = (y: number) => 38 + y * 67;
function position(result: TwinResult, trip: Trip, frame: Frame, time: number) {
  const segment = trip.segments.find((s) => time >= s.start && time < s.end);
  if (segment) {
    const edge = result.scenario.layout.edges.find(
      (e) => e.id === segment.edgeId,
    )!;
    const from = result.scenario.layout.nodes.find((n) => n.id === edge.from)!;
    const to = result.scenario.layout.nodes.find((n) => n.id === edge.to)!;
    const progress = (time - segment.start) / (segment.end - segment.start);
    return {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
  }
  return frame.vehicles.find((v) => v.vehicleId === trip.vehicleId)!;
}
function ParkingMap({
  result,
  time,
  selected,
  onSelect,
  heatmap,
  routes,
}: {
  result: TwinResult;
  time: number;
  selected: string | null;
  onSelect: (id: string) => void;
  heatmap: boolean;
  routes: boolean;
}) {
  const frame = frameAt(result, time);
  const layout = result.scenario.layout;
  const trip = result.trips.find(
    (t) => t.vehicleId === selected && t.arrivalTime <= time,
  );
  const activeRoute = new Set(trip?.route ?? []);
  return (
    <div className="map-wrap">
      <svg
        viewBox="0 0 504 422"
        role="img"
        aria-label={`${labels[result.strategy]} 주차장, 시각 ${Math.floor(time)}, 점유 ${frame.occupied.length}면`}
      >
        <defs>
          <pattern
            id={`grid-${result.strategy}`}
            width="16"
            height="16"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="0.6" fill="#dce4ee" />
          </pattern>
        </defs>
        <rect width="504" height="422" fill={`url(#grid-${result.strategy})`} />
        <text x="23" y="20" className="map-label">
          IN
        </text>
        <text x="438" y="402" className="map-label">
          OUT
        </text>
        {layout.edges.map((edge) => {
          const from = layout.nodes.find((n) => n.id === edge.from)!;
          const to = layout.nodes.find((n) => n.id === edge.to)!;
          const state = frame.edges.find((e) => e.edgeId === edge.id)!;
          return (
            <g key={edge.id}>
              <line
                x1={px(from.x)}
                y1={py(from.y)}
                x2={px(to.x)}
                y2={py(to.y)}
                stroke="#e0e7ef"
                strokeWidth="18"
                strokeLinecap="round"
              />
              <line
                x1={px(from.x)}
                y1={py(from.y)}
                x2={px(to.x)}
                y2={py(to.y)}
                stroke={
                  routes && activeRoute.has(edge.id)
                    ? "#5375ef"
                    : heatmap && state.queued
                      ? "#f18e56"
                      : "#b9c7d8"
                }
                strokeWidth={
                  heatmap && state.queued
                    ? 10
                    : routes && activeRoute.has(edge.id)
                      ? 4
                      : 1
                }
                strokeDasharray={
                  routes && activeRoute.has(edge.id) ? undefined : "3 5"
                }
                opacity={heatmap && state.queued ? 0.8 : 1}
              />
              {heatmap && state.queued > 0 && (
                <text
                  x={(px(from.x) + px(to.x)) / 2}
                  y={(py(from.y) + py(to.y)) / 2 - 13}
                  className="queue-label"
                >
                  대기 {state.queued}
                </text>
              )}
            </g>
          );
        })}
        {[1, 2, 3, 4].map((zone) => (
          <text key={zone} x="14" y={py(zone) + 36} className="zone-label">
            {String.fromCharCode(64 + zone)}
          </text>
        ))}
        {layout.spots.map((spot) => {
          const node = layout.nodes.find((n) => n.id === spot.node)!;
          const parked = frame.occupied.includes(spot.id),
            reserved = frame.reserved.includes(spot.id);
          const vehicle = result.trips.find(
            (t) =>
              t.spotId === spot.id &&
              t.arrivalTime <= time &&
              (t.leftSpotAt === null || t.leftSpotAt > time),
          );
          return (
            <g
              key={spot.id}
              role="button"
              tabIndex={0}
              aria-label={`P${spot.id} ${vehicle?.vehicleId ?? "빈자리"}`}
              onClick={() => vehicle && onSelect(vehicle.vehicleId)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && vehicle) {
                  e.preventDefault();
                  onSelect(vehicle.vehicleId);
                }
              }}
              className="spot-target"
            >
              <rect
                x={px(node.x) - 24}
                y={py(node.y) + 14}
                width="48"
                height="39"
                rx="6"
                fill={
                  selected && vehicle?.vehicleId === selected
                    ? "#e3dcff"
                    : parked
                      ? "#e0e9ff"
                      : reserved
                        ? "#fff1dc"
                        : "#fff"
                }
                stroke={
                  selected && vehicle?.vehicleId === selected
                    ? "#8466e9"
                    : parked
                      ? "#91aaf3"
                      : reserved
                        ? "#e6bc75"
                        : "#d1dce8"
                }
              />
              <text
                x={px(node.x)}
                y={py(node.y) + 29}
                textAnchor="middle"
                className="spot-label"
              >
                P{String(spot.id).padStart(2, "0")}
              </text>
              <text
                x={px(node.x)}
                y={py(node.y) + 44}
                textAnchor="middle"
                className="spot-state"
              >
                {parked ? "주차" : reserved ? "예약" : "빈자리"}
              </text>
            </g>
          );
        })}
        {frame.vehicles.map((vehicle) => {
          const trip = result.trips.find(
            (t) => t.vehicleId === vehicle.vehicleId,
          )!;
          const point = position(result, trip, frame, time);
          const isParked =
            vehicle.phase === "parked" ||
            vehicle.phase === "parking" ||
            (vehicle.phase === "outbound" &&
              (trip.leftSpotAt === null || trip.leftSpotAt > time));
          const x = px(point.x),
            y = py(point.y) + (isParked ? 33 : 0);
          return (
            <g
              key={vehicle.vehicleId}
              transform={`translate(${x}, ${y})`}
              role="button"
              tabIndex={0}
              aria-label={`${vehicle.vehicleId} ${phaseLabels[vehicle.phase]}${vehicle.waiting ? " 대기" : ""}`}
              onClick={() => onSelect(vehicle.vehicleId)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(vehicle.vehicleId);
                }
              }}
              className="vehicle"
            >
              {selected === vehicle.vehicleId && (
                <circle r="14" fill="none" stroke="#9167e8" strokeWidth="2" />
              )}
              <rect
                x="-8"
                y="-5"
                width="16"
                height="10"
                rx="3"
                fill={
                  vehicle.waiting
                    ? "#ed9451"
                    : vehicle.phase === "outbound"
                      ? "#22a398"
                      : "#5678e8"
                }
                stroke="white"
                strokeWidth="1.5"
              />
              <rect
                x="-3"
                y="-3"
                width="5"
                height="6"
                rx="1"
                fill="white"
                opacity="0.55"
              />
              <title>
                {vehicle.vehicleId} · {phaseLabels[vehicle.phase]}
              </title>
            </g>
          );
        })}
        <text x="24" y="402" className="map-footnote">
          단방향 통로 · 간선당 1대 · 20면
        </text>
      </svg>
    </div>
  );
}
export function RunPanel(props: {
  result: TwinResult;
  time: number;
  selected: string | null;
  onSelect: (id: string) => void;
  heatmap: boolean;
  routes: boolean;
  index: number;
}) {
  const { result, time } = props;
  const frame = frameAt(result, time);
  const queued = frame.vehicles.filter((v) => v.waiting).length;
  return (
    <section className={`run-panel panel run-${props.index}`}>
      <div className="run-heading">
        <div>
          <span className="eyebrow">
            {props.index === 0 ? "BASELINE" : "CHALLENGER"}
          </span>
          <h2>
            {labels[result.strategy]}
            <span className={`tag ${result.strategy === "rl" ? "purple" : ""}`}>
              {result.strategy === "rl" ? "학습된 정책" : "기준 전략"}
            </span>
          </h2>
        </div>
        <span className="live-dot">
          {time >= result.metrics.endTime ? "완료" : "시뮬레이션"}
        </span>
      </div>
      <div className="run-stats">
        <div>
          <span>주차 중</span>
          <strong>
            {frame.occupied.length}
            <small> / 20</small>
          </strong>
        </div>
        <div>
          <span>통로 대기</span>
          <strong className={queued ? "orange-text" : ""}>
            {queued}
            <small> 대</small>
          </strong>
        </div>
        <div>
          <span>미배정</span>
          <strong>
            {frame.rejected}
            <small> 대</small>
          </strong>
        </div>
      </div>
      <ParkingMap {...props} />
      <div className="map-legend">
        <span>
          <i className="blue" />
          입차·주차
        </span>
        <span>
          <i className="teal" />
          출차
        </span>
        <span>
          <i className="orange" />
          대기
        </span>
        <span>
          <i className="reserved" />
          예약
        </span>
      </div>
    </section>
  );
}
