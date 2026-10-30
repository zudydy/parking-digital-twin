export interface Node {
  id: string;
  x: number;
  y: number;
}
export interface Edge {
  id: string;
  from: string;
  to: string;
  ticks: number;
  capacity: number;
  /** Minimum ticks between consecutive entries on this link. */
  headway?: number;
}
export interface Spot {
  id: number;
  node: string;
  zone: number;
}
export interface Layout {
  nodes: Node[];
  edges: Edge[];
  spots: Spot[];
  entrance: string;
  exit: string;
}
export interface Demand {
  vehicleId: string;
  arrivalTime: number;
  /** Legacy CSV: dwell time starts after parking completes. */
  duration: number;
  /** Desired absolute departure time, known only to the environment. */
  departureRequest?: number;
  estimatedDeparture: number;
}
export interface Scenario {
  id: string;
  title: string;
  description: string;
  seed: number;
  observationEnd: number;
  vehicles: Demand[];
  layout: Layout;
  initialParked?: {
    vehicleId: string;
    spotId: number;
    departureRequest: number;
    estimatedDeparture: number;
  }[];
  provenance?: {
    sourceUrl: string;
    updatedAt: string;
    fetchedAt: string;
    floor: string;
    available: number;
    occupancyPercent: number;
    modelCapacity: number;
    zones: string[];
    geometry: string;
    demand: string;
  };
}
export type Phase =
  "inbound" | "parking" | "parked" | "outbound" | "exited" | "rejected";
export interface Segment {
  edgeId: string;
  start: number;
  end: number;
  direction: "inbound" | "outbound";
}
export interface Trip {
  initial?: boolean;
  vehicleId: string;
  arrivalTime: number;
  estimatedDeparture: number;
  spotId: number | null;
  phase: Phase;
  node: string;
  route: string[];
  segments: Segment[];
  parkedAt: number | null;
  departureRequestedAt: number | null;
  leftSpotAt: number | null;
  exitedAt: number | null;
  waitingTicks: number;
  distance: number;
}
export interface Frame {
  time: number;
  occupied: number[];
  reserved: number[];
  vehicles: {
    vehicleId: string;
    phase: Phase;
    x: number;
    y: number;
    waiting: boolean;
  }[];
  edges: { edgeId: string; moving: number; queued: number }[];
  arrived: number;
  rejected: number;
}
export interface Metrics {
  totalVehicles: number;
  assigned: number;
  rejected: number;
  rejectionRate: number;
  averageParkingTime: number;
  averageExitTime: number;
  averageDistance: number;
  totalDelay: number;
  averageOccupancyRate: number;
  peakQueue: number;
  endTime: number;
  observationEnd: number;
  cost: number;
}
export interface TwinResult {
  scenario: Omit<Scenario, "vehicles">;
  strategy: string;
  trips: Trip[];
  frames: Frame[];
  metrics: Metrics;
}
export interface Candidate {
  spotId: number;
  zone: number;
  available: boolean;
  inboundDistance: number;
  outboundDistance: number;
  queue: number;
  departurePressure: number;
}
/** Actual departure requests and future vehicle records are intentionally absent. */
export interface Observation {
  time: number;
  estimatedDeparture: number;
  occupancy: number;
  candidates: Candidate[];
}
export interface Strategy {
  id: string;
  choose(observation: Observation): number;
}
