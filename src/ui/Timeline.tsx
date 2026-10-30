import type { TwinResult } from "../twin/model.js";
export function Timeline({
  left,
  right,
  time,
  end,
  onSeek,
}: {
  left: TwinResult;
  right: TwinResult;
  time: number;
  end: number;
  onSeek: (time: number) => void;
}) {
  const line = (result: TwinResult, queue = false) =>
    result.frames
      .map(
        (f) =>
          `${24 + (f.time / end) * 952},${queue ? 92 - Math.min(20, f.vehicles.filter((v) => v.waiting).length) * 3 : 92 - f.occupied.length * 3}`,
      )
      .join(" ");
  return (
    <svg
      className="timeline-chart"
      viewBox="0 0 1000 120"
      role="img"
      aria-label="시간별 주차 차량 수와 통로 대기 추이"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(
          Math.max(
            0,
            Math.min(
              end,
              ((((e.clientX - r.left) / r.width) * 1000 - 24) / 952) * end,
            ),
          ),
        );
      }}
    >
      {[0, 10, 20].map((n) => (
        <g key={n}>
          <line
            x1="24"
            x2="976"
            y1={92 - n * 3}
            y2={92 - n * 3}
            stroke="#e7edf4"
          />
          <text x="4" y={96 - n * 3}>
            {n}
          </text>
        </g>
      ))}
      <polyline
        points={line(left)}
        fill="none"
        stroke="#647dba"
        strokeWidth="2"
      />
      <polyline
        points={line(right)}
        fill="none"
        stroke="#8a63d6"
        strokeWidth="2"
      />
      <polyline
        points={line(right, true)}
        fill="none"
        stroke="#e5945c"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <line
        x1={24 + (time / end) * 952}
        x2={24 + (time / end) * 952}
        y1="16"
        y2="96"
        stroke="#293b5c"
        strokeWidth="1.5"
      />
      {[0, 1, 2, 3, 4].map((n) => (
        <text key={n} x={24 + n * 238} y="114" textAnchor="middle">
          {Math.round((end * n) / 4)}
        </text>
      ))}
    </svg>
  );
}
