import { useEffect, useRef, useState } from "react";
import type { TwinResult } from "../twin/model.js";
import type { SceneView } from "./scene.js";
import { frameAt, labels } from "./presentation.js";
interface Props {
  result: TwinResult;
  time: number;
  selected: string | null;
  onSelect: (id: string) => void;
  heatmap: boolean;
  routes: boolean;
  index: number;
  night?: boolean;
}
function ParkingScene(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<SceneView | null>(null),
    latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError("");
    void import("./scene.js")
      .then(({ buildScene }) => {
        if (disposed || !host.current) return;
        view.current = buildScene(host.current, props.result, props.onSelect);
        const p = latest.current;
        view.current.update(
          p.time,
          p.selected,
          p.heatmap,
          p.routes,
          p.night ?? false,
        );
        setLoading(false);
      })
      .catch(() => {
        if (!disposed) {
          setError(
            "이 환경에서 3D 화면을 시작하지 못했습니다. WebGL이 지원되는 브라우저를 사용하세요. 시뮬레이션 수치는 계속 확인할 수 있습니다.",
          );
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
      view.current?.dispose();
      view.current = null;
    };
  }, [props.result, props.onSelect]);
  useEffect(() => {
    view.current?.update(
      props.time,
      props.selected,
      props.heatmap,
      props.routes,
      props.night ?? false,
    );
  }, [props.time, props.selected, props.heatmap, props.routes, props.night]);
  return (
    <div className={`scene-shell ${props.night ? "night" : ""}`}>
      <div className="scene-canvas" ref={host} />
      <div className="scene-corner scene-top-left">
        <span className="scene-badge">
          <i />
          ORTHOGRAPHIC / 2.5D
        </span>
        <span>
          {props.result.scenario.id === "incheon"
            ? "ICN · TERMINAL 1"
            : "PARKING LAB"}
        </span>
      </div>
      <div className="scene-corner scene-top-right">
        <button
          disabled={!props.selected}
          onClick={() => props.selected && view.current?.focus(props.selected)}
          title="선택 차량 따라가기"
          aria-label={`${labels[props.result.strategy]} 선택 차량 따라가기`}
        >
          ⌖
        </button>
        <button
          onClick={() => view.current?.reset()}
          title="시점 초기화"
          aria-label={`${labels[props.result.strategy]} 시점 초기화`}
        >
          ↺
        </button>
        <button
          onClick={() => view.current?.top()}
          title="위에서 보기"
          aria-label={`${labels[props.result.strategy]} 위에서 보기`}
        >
          ⊞
        </button>
      </div>
      <div className="scene-corner scene-bottom-left">
        <span>드래그 회전</span>
        <b>·</b>
        <span>휠 확대</span>
        <b>·</b>
        <span>차량 선택</span>
      </div>
      <div className="scene-corner scene-bottom-right">
        <div className="north">
          N<span>↑</span>
        </div>
      </div>
      {loading && (
        <div className="scene-loading">
          <span />
          입체 환경을 구성하고 있습니다
        </div>
      )}
      {error && (
        <div className="scene-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
export function RunPanel(props: Props) {
  const { result, time } = props,
    frame = frameAt(result, time),
    capacity = result.scenario.layout.spots.length;
  const queued = frame.vehicles.filter((v) => v.waiting).length;
  return (
    <section className={`run-panel panel run-${props.index}`}>
      <div className="run-heading">
        <div>
          <span className="eyebrow">
            {props.index === 0 ? "REFERENCE POLICY" : "ALLOCATION POLICY"}
          </span>
          <h2>
            {labels[result.strategy]}
            <span className={`tag ${result.strategy === "rl" ? "purple" : ""}`}>
              {result.strategy === "rl"
                ? `${capacity}면 학습 정책`
                : "기준 전략"}
            </span>
          </h2>
        </div>
        <div className="scene-live">
          <i />
          <span>
            {time >= result.metrics.endTime ? "RUN COMPLETE" : "SIMULATION"}
          </span>
          <strong>t+{Math.floor(time).toString().padStart(3, "0")}</strong>
        </div>
      </div>
      <ParkingScene {...props} />
      <div className="scene-footer">
        <div className="run-stats">
          <div>
            <span>점유율</span>
            <strong>
              {Math.round((frame.occupied.length / capacity) * 100)}
              <small>%</small>
            </strong>
          </div>
          <div>
            <span>주차 중</span>
            <strong>
              {frame.occupied.length}
              <small> / {capacity}</small>
            </strong>
          </div>
          <div>
            <span>통로 대기</span>
            <strong className={queued ? "orange-text" : ""}>
              {queued}
              <small>대</small>
            </strong>
          </div>
          <div>
            <span>미배정</span>
            <strong>
              {frame.rejected}
              <small>대</small>
            </strong>
          </div>
        </div>
        <div className="map-legend">
          <span>
            <i className="teal" />
            선택 경로
          </span>
          <span>
            <i className="orange" />
            통로 대기
          </span>
          <span>
            <i className="reserved" />
            이동 중 예약
          </span>
        </div>
      </div>
    </section>
  );
}
