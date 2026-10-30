import { OBJECTIVE_VERSION, REWARD_SCALE, serviceScore } from "./objective.js";
import { routeLength, shortestPath } from "./layout.js";
import type {
  DecisionRecord,
  Demand,
  Edge,
  Frame,
  Observation,
  Scenario,
  Strategy,
  Trip,
  TwinResult,
} from "./model.js";

interface Runtime {
  trip: Trip;
  demand: Demand;
  path: Edge[];
  index: number;
  active?: { edge: Edge; end: number };
  queuedAt?: number;
  queueOrder?: number;
  readyAt?: number;
}
export const MAX_TICKS = 20000;

export class TwinEnvironment {
  readonly scenario: Scenario;
  readonly frames: Frame[] = [];
  readonly trips: Trip[] = [];
  readonly decisions: DecisionRecord[] = [];
  private rejectedCount = 0;
  private rewardCursor = 0;
  private operatingScale = 1;
  private ordered: Demand[];
  private cursor = 0;
  private time = 0;
  private runtimes: Runtime[] = [];
  private reserved = new Map<number, Runtime>();
  private occupied = new Set<number>();
  private occupiedArea = 0;
  private peakQueue = 0;
  private sequence = 0;
  private lastEntry = new Map<string, number>();
  private totalCost = 0;
  private record: boolean;
  private inbound = new Map<number, Edge[]>();
  private outbound = new Map<number, Edge[]>();

  constructor(scenario: Scenario, record = true) {
    this.scenario = scenario;
    this.record = record;
    this.validate();
    this.ordered = scenario.vehicles
      .map((v) => ({ ...v }))
      .sort((a, b) => a.arrivalTime - b.arrivalTime);
    for (const spot of scenario.layout.spots) {
      this.inbound.set(
        spot.id,
        shortestPath(scenario.layout, scenario.layout.entrance, spot.node),
      );
      const paths: Edge[][] = [];
      for (const exit of scenario.layout.exits ?? [scenario.layout.exit]) {
        try {
          paths.push(shortestPath(scenario.layout, spot.node, exit));
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !error.message.startsWith("경로가 없습니다:")
          )
            throw error;
        }
      }
      if (!paths.length)
        throw new Error(`주차면 ${spot.id}에서 도달 가능한 출구가 없습니다.`);
      this.outbound.set(
        spot.id,
        paths.sort((a, b) => routeLength(a) - routeLength(b))[0]!,
      );
    }
    const maxTrip =
      Math.max(
        ...scenario.layout.spots.map(
          (s) =>
            routeLength(this.inbound.get(s.id)!) +
            routeLength(this.outbound.get(s.id)!),
        ),
      ) + 1;
    this.operatingScale = Math.max(
      1,
      (scenario.vehicles.length + (scenario.initialParked?.length ?? 0)) *
        maxTrip,
    );
    for (const initial of scenario.initialParked ?? []) {
      if (
        this.reserved.has(initial.spotId) ||
        !this.outbound.has(initial.spotId) ||
        scenario.vehicles.some((v) => v.vehicleId === initial.vehicleId) ||
        this.trips.some((t) => t.vehicleId === initial.vehicleId) ||
        !Number.isSafeInteger(initial.departureRequest) ||
        initial.departureRequest < 1 ||
        initial.departureRequest >= MAX_TICKS / 2 ||
        !Number.isFinite(initial.estimatedDeparture)
      )
        throw new Error("초기 주차 상태가 유효하지 않습니다.");
      const node = scenario.layout.spots.find(
        (s) => s.id === initial.spotId,
      )!.node;
      const trip: Trip = {
        initial: true,
        vehicleId: initial.vehicleId,
        arrivalTime: 0,
        estimatedDeparture: initial.estimatedDeparture,
        spotId: initial.spotId,
        phase: "parked",
        node,
        route: this.outbound.get(initial.spotId)!.map((e) => e.id),
        segments: [],
        parkedAt: 0,
        departureRequestedAt: initial.departureRequest,
        departureReadyAt: initial.departureRequest,
        leftSpotAt: null,
        exitedAt: null,
        waitingTicks: 0,
        distance: 0,
      };
      const demand: Demand = {
        vehicleId: initial.vehicleId,
        arrivalTime: 0,
        duration: initial.departureRequest,
        estimatedDeparture: initial.estimatedDeparture,
        departureRequest: initial.departureRequest,
      };
      const runtime: Runtime = {
        trip,
        demand,
        path: this.outbound.get(initial.spotId)!,
        index: 0,
      };
      this.runtimes.push(runtime);
      this.trips.push(trip);
      this.reserved.set(initial.spotId, runtime);
      this.occupied.add(initial.spotId);
    }
    this.prepareDecision();
  }
  private validate() {
    const { layout, vehicles, observationEnd } = this.scenario;
    if (
      !Number.isSafeInteger(observationEnd) ||
      observationEnd < 1 ||
      observationEnd >= MAX_TICKS
    )
      throw new Error("관측 종료 시각이 유효하지 않습니다.");
    const unique = (values: (number | string)[]) =>
      new Set(values).size === values.length;
    if (
      !layout.spots.length ||
      !unique(layout.spots.map((s) => s.id)) ||
      !unique(layout.nodes.map((n) => n.id)) ||
      !unique(layout.edges.map((e) => e.id))
    )
      throw new Error("레이아웃 ID 또는 주차면이 유효하지 않습니다.");
    const nodeIds = new Set(layout.nodes.map((n) => n.id));
    if (
      !nodeIds.has(layout.entrance) ||
      !nodeIds.has(layout.exit) ||
      (layout.exits !== undefined &&
        (!layout.exits.length ||
          layout.exits.some((exit) => !nodeIds.has(exit)))) ||
      layout.spots.some((s) => !nodeIds.has(s.node))
    )
      throw new Error("입구·출구·주차면 노드를 확인하세요.");
    if (
      layout.edges.some(
        (e) =>
          !nodeIds.has(e.from) ||
          !nodeIds.has(e.to) ||
          !Number.isSafeInteger(e.ticks) ||
          e.ticks < 1 ||
          !Number.isSafeInteger(e.capacity) ||
          e.capacity < 1 ||
          (e.headway !== undefined &&
            (!Number.isSafeInteger(e.headway) || e.headway < 1)),
      )
    )
      throw new Error("통로 시간과 용량은 양의 정수여야 합니다.");
    if (!unique(vehicles.map((v) => v.vehicleId)) || vehicles.length > 5000)
      throw new Error("차량 ID는 중복 없이 최대 5,000대까지 가능합니다.");
    for (const v of vehicles) {
      if (
        !v.vehicleId ||
        !Number.isSafeInteger(v.arrivalTime) ||
        v.arrivalTime < 0 ||
        v.arrivalTime >= observationEnd ||
        !Number.isSafeInteger(v.duration) ||
        v.duration < 1 ||
        v.duration > MAX_TICKS / 2 ||
        !Number.isFinite(v.estimatedDeparture) ||
        v.estimatedDeparture < v.arrivalTime ||
        (v.departureRequest !== undefined &&
          (!Number.isSafeInteger(v.departureRequest) ||
            v.departureRequest < v.arrivalTime ||
            v.departureRequest >= MAX_TICKS / 2))
      )
        throw new Error(`차량 입력을 확인하세요: ${v.vehicleId}`);
    }
  }
  get done() {
    return this.cursor >= this.ordered.length;
  }
  get cost() {
    return serviceScore(
      this.rejectedCount,
      this.totalCost,
      this.operatingScale,
    );
  }
  observation(): Observation | null {
    const vehicle = this.ordered[this.cursor];
    if (!vehicle) return null;
    const zones = new Map(
      this.scenario.layout.spots.map((s) => [s.id, s.zone]),
    );
    const queueCounts = new Map<string, number>();
    for (const r of this.runtimes)
      if (r.queuedAt !== undefined && r.path[r.index]) {
        const id = r.path[r.index]!.id;
        queueCounts.set(id, (queueCounts.get(id) ?? 0) + 1);
      }
    return {
      time: this.time,
      estimatedDeparture: vehicle.estimatedDeparture,
      occupancy: this.reserved.size / this.scenario.layout.spots.length,
      candidates: this.scenario.layout.spots.map((spot) => {
        const path = this.inbound.get(spot.id)!;
        const edgeIds = new Set(
          [...path, ...this.outbound.get(spot.id)!].map((e) => e.id),
        );
        const queue = [...edgeIds].reduce(
          (sum, id) => sum + (queueCounts.get(id) ?? 0),
          0,
        );
        const departurePressure = [...this.reserved.values()].filter(
          (r) =>
            zones.get(r.trip.spotId!) === spot.zone &&
            Math.abs(
              r.demand.estimatedDeparture - vehicle.estimatedDeparture,
            ) <= 8,
        ).length;
        return {
          spotId: spot.id,
          zone: spot.zone,
          available: !this.reserved.has(spot.id),
          inboundDistance: routeLength(path),
          outboundDistance: routeLength(this.outbound.get(spot.id)!),
          queue,
          departurePressure,
        };
      }),
    };
  }
  /** One action per arrival. A full lot is processed without requesting an action. */
  step(
    spotId: number,
    diagnosis?: ReturnType<NonNullable<Strategy["diagnose"]>>,
  ): { reward: number; done: boolean } {
    const demand = this.ordered[this.cursor];
    if (!demand) throw new Error("종료된 환경입니다.");
    const spot = this.scenario.layout.spots.find((s) => s.id === spotId);
    if (!spot || this.reserved.has(spotId))
      throw new Error(`사용 불가 주차면: ${spotId}`);
    const previousCost = this.rewardCursor;
    if (this.record)
      this.decisions.push({
        vehicleId: demand.vehicleId,
        time: this.time,
        spotId,
        observation: structuredClone(
          diagnosis?.observation ?? this.observation()!,
        ),
        qValues: diagnosis?.qValues ?? null,
        featureMode: diagnosis?.featureMode ?? "full",
      });
    const trip: Trip = {
      vehicleId: demand.vehicleId,
      arrivalTime: demand.arrivalTime,
      estimatedDeparture: demand.estimatedDeparture,
      spotId,
      phase: "inbound",
      node: this.scenario.layout.entrance,
      route: [...this.inbound.get(spotId)!, ...this.outbound.get(spotId)!].map(
        (e) => e.id,
      ),
      segments: [],
      parkedAt: null,
      departureRequestedAt: demand.departureRequest ?? null,
      departureReadyAt: null,
      leftSpotAt: null,
      exitedAt: null,
      waitingTicks: 0,
      distance: 0,
    };
    const runtime: Runtime = {
      trip,
      demand,
      path: this.inbound.get(spotId)!,
      index: 0,
    };
    this.runtimes.push(runtime);
    this.trips.push(trip);
    this.reserved.set(spotId, runtime);
    this.enqueue(runtime);
    this.cursor++;
    this.prepareDecision();
    const reward = -(this.cost - previousCost) * REWARD_SCALE;
    this.rewardCursor = this.cost;
    return { reward, done: this.done };
  }
  private enqueue(runtime: Runtime) {
    runtime.queuedAt = this.time;
    runtime.queueOrder = this.sequence++;
  }
  private prepareDecision() {
    while (!this.done) {
      const demand = this.ordered[this.cursor]!;
      while (this.time < demand.arrivalTime) this.tick();
      this.dispatch();
      if (this.reserved.size < this.scenario.layout.spots.length) return;
      this.trips.push({
        vehicleId: demand.vehicleId,
        arrivalTime: demand.arrivalTime,
        estimatedDeparture: demand.estimatedDeparture,
        spotId: null,
        phase: "rejected",
        node: this.scenario.layout.entrance,
        route: [],
        segments: [],
        parkedAt: null,
        departureRequestedAt: demand.departureRequest ?? null,
        departureReadyAt: null,
        leftSpotAt: null,
        exitedAt: null,
        waitingTicks: 0,
        distance: 0,
      });
      this.rejectedCount++;
      this.cursor++;
    }
    while (this.runtimes.some((r) => r.trip.phase !== "exited")) this.tick();
    this.capture();
  }
  private tick() {
    // At time t: complete movements and release departures before arrivals at t.
    this.dispatch();
    this.capture();
    if (this.time < this.scenario.observationEnd)
      this.occupiedArea += this.occupied.size;
    for (const r of this.runtimes) {
      if (r.active) this.totalCost++;
      if (r.queuedAt !== undefined) {
        r.trip.waitingTicks++;
        this.totalCost++;
      }
    }
    this.time++;
    if (this.time > MAX_TICKS)
      throw new Error("시뮬레이션 시간 제한을 초과했습니다.");
    for (const r of this.runtimes) {
      if (r.active?.end === this.time) {
        r.trip.node = r.active.edge.to;
        r.trip.distance += r.active.edge.ticks;
        r.active = undefined;
        r.index++;
        if (r.index < r.path.length) this.enqueue(r);
        else if (r.trip.phase === "inbound") {
          r.trip.phase = "parking";
          r.readyAt = this.time + 1;
          this.totalCost++;
        } else {
          r.trip.phase = "exited";
          r.trip.exitedAt = this.time;
        }
      }
      if (r.trip.phase === "parking" && r.readyAt === this.time) {
        r.trip.phase = "parked";
        r.trip.parkedAt = this.time;
        r.trip.departureRequestedAt =
          r.demand.departureRequest ?? this.time + r.demand.duration;
        r.trip.departureReadyAt = Math.max(
          this.time + 1,
          r.trip.departureRequestedAt,
        );
        this.totalCost += r.trip.departureReadyAt - r.trip.departureRequestedAt;
        this.occupied.add(r.trip.spotId!);
      }
      if (r.trip.phase === "parked" && r.trip.departureReadyAt! <= this.time) {
        r.trip.phase = "outbound";
        r.path = this.outbound.get(r.trip.spotId!)!;
        r.index = 0;
        this.enqueue(r);
      }
    }
  }
  private dispatch() {
    const used = new Map<string, number>();
    for (const r of this.runtimes)
      if (r.active)
        used.set(r.active.edge.id, (used.get(r.active.edge.id) ?? 0) + 1);
    const queued = this.runtimes
      .filter((r) => r.queuedAt !== undefined)
      .sort(
        (a, b) => a.queuedAt! - b.queuedAt! || a.queueOrder! - b.queueOrder!,
      );
    for (const r of queued) {
      const edge = r.path[r.index]!;
      if (
        (used.get(edge.id) ?? 0) >= edge.capacity ||
        (edge.headway !== undefined &&
          this.time - (this.lastEntry.get(edge.id) ?? -Infinity) < edge.headway)
      )
        continue;
      if (r.trip.phase === "outbound" && r.trip.leftSpotAt === null) {
        r.trip.leftSpotAt = this.time;
        this.reserved.delete(r.trip.spotId!);
        this.occupied.delete(r.trip.spotId!);
      }
      this.lastEntry.set(edge.id, this.time);
      r.active = { edge, end: this.time + edge.ticks };
      r.queuedAt = undefined;
      r.trip.segments.push({
        edgeId: edge.id,
        start: this.time,
        end: r.active.end,
        direction: r.trip.phase as "inbound" | "outbound",
      });
      used.set(edge.id, (used.get(edge.id) ?? 0) + 1);
    }
    this.peakQueue = Math.max(
      this.peakQueue,
      this.runtimes.filter((r) => r.queuedAt !== undefined).length,
    );
  }
  private capture() {
    if (!this.record) return;
    const nodes = new Map(this.scenario.layout.nodes.map((n) => [n.id, n]));
    const frame: Frame = {
      time: this.time,
      occupied: [...this.occupied],
      reserved: [...this.reserved.keys()],
      arrived: this.trips.filter((t) => !t.initial).length,
      rejected: this.trips.filter((t) => t.spotId === null).length,
      vehicles: this.runtimes
        .filter((r) => r.trip.phase !== "exited")
        .map((r) => {
          const node = nodes.get(r.trip.node)!;
          const from = r.active ? nodes.get(r.active.edge.from)! : node;
          const to = r.active ? nodes.get(r.active.edge.to)! : node;
          const progress = r.active
            ? (this.time - (r.active.end - r.active.edge.ticks)) /
              r.active.edge.ticks
            : 0;
          return {
            vehicleId: r.trip.vehicleId,
            phase: r.trip.phase,
            x: from.x + (to.x - from.x) * progress,
            y: from.y + (to.y - from.y) * progress,
            waiting: r.queuedAt !== undefined,
          };
        }),
      edges: this.scenario.layout.edges.map((e) => ({
        edgeId: e.id,
        moving: this.runtimes.filter((r) => r.active?.edge.id === e.id).length,
        queued: this.runtimes.filter(
          (r) => r.queuedAt !== undefined && r.path[r.index]?.id === e.id,
        ).length,
      })),
    };
    this.frames[this.time] = frame;
  }
  result(strategy: string): TwinResult {
    if (!this.done) throw new Error("시뮬레이션이 아직 완료되지 않았습니다.");
    const demandTrips = this.trips.filter((t) => !t.initial);
    const assigned = demandTrips.filter((t) => t.spotId !== null);
    const mean = (get: (trip: Trip) => number) =>
      assigned.length
        ? assigned.reduce((sum, trip) => sum + get(trip), 0) / assigned.length
        : 0;
    const { vehicles: _, ...scenario } = this.scenario;
    return {
      objectiveVersion: OBJECTIVE_VERSION,
      decisions: this.decisions,
      scenario,
      strategy,
      trips: this.trips,
      frames: this.frames,
      metrics: {
        totalVehicles: demandTrips.length,
        assigned: assigned.length,
        rejected: demandTrips.length - assigned.length,
        rejectionRate: demandTrips.length
          ? ((demandTrips.length - assigned.length) / demandTrips.length) * 100
          : 0,
        averageParkingTime: mean((t) => t.parkedAt! - t.arrivalTime),
        averageExitTime: mean((t) => t.exitedAt! - t.departureReadyAt!),
        averageScheduledExitTime: mean(
          (t) => t.exitedAt! - t.departureRequestedAt!,
        ),
        averageScheduleDelay: mean(
          (t) => t.departureReadyAt! - t.departureRequestedAt!,
        ),
        lateDepartureVehicles: assigned.filter(
          (t) => t.departureReadyAt! > t.departureRequestedAt!,
        ).length,
        operatingCost: this.totalCost,
        operatingScale: this.operatingScale,
        serviceRate: demandTrips.length
          ? (assigned.length / demandTrips.length) * 100
          : 0,
        averageDistance: mean((t) => t.distance),
        totalDelay: this.trips.reduce((sum, t) => sum + t.waitingTicks, 0),
        averageOccupancyRate:
          (this.occupiedArea /
            (this.scenario.observationEnd *
              this.scenario.layout.spots.length)) *
          100,
        peakQueue: this.peakQueue,
        endTime: this.time,
        observationEnd: this.scenario.observationEnd,
        cost: this.cost,
      },
    };
  }
}
export function simulateTwin(
  scenario: Scenario,
  strategy: Strategy,
  record = true,
): TwinResult {
  const environment = new TwinEnvironment(scenario, record);
  while (!environment.done) {
    const observation = environment.observation()!;
    environment.step(
      strategy.choose(observation),
      record ? strategy.diagnose?.(observation) : undefined,
    );
  }
  return environment.result(strategy.id);
}
