export const PARKING_CAPACITY = 20;

export interface Vehicle {
  vehicleId: string;
  arrivalTime: number;
  duration: number;
}

export interface ParkingSpot {
  id: number;
  row: number;
  column: number;
  distance: number;
}

export interface Assignment {
  vehicleId: string;
  arrivalTime: number;
  departureTime: number | null;
  spotId: number | null;
  distance: number | null;
}

export interface SimulationResult {
  totalVehicles: number;
  averageDistance: number;
  averageOccupancyRate: number;
  assignments: Assignment[];
}

interface IndexedVehicle extends Vehicle {
  inputOrder: number;
}

export function createParkingSpots(): ParkingSpot[] {
  const spots: ParkingSpot[] = [];

  for (let row = 1; row <= 4; row += 1) {
    for (let column = 1; column <= 5; column += 1) {
      spots.push({
        id: (row - 1) * 5 + column,
        row,
        column,
        distance: row + column,
      });
    }
  }

  return spots;
}

export function simulateParking(vehicles: Vehicle[]): SimulationResult {
  if (vehicles.length === 0) {
    return {
      totalVehicles: 0,
      averageDistance: 0,
      averageOccupancyRate: 0,
      assignments: [],
    };
  }

  const orderedVehicles: IndexedVehicle[] = vehicles
    .map((vehicle, inputOrder) => ({ ...vehicle, inputOrder }))
    .sort(
      (left, right) =>
        left.arrivalTime - right.arrivalTime ||
        left.inputOrder - right.inputOrder,
    );
  const spots = createParkingSpots().sort(
    (left, right) => left.distance - right.distance || left.id - right.id,
  );
  const occupiedUntil = new Map<number, number>();
  const assignments: Assignment[] = [];

  for (const vehicle of orderedVehicles) {
    for (const [spotId, departureTime] of occupiedUntil) {
      if (departureTime <= vehicle.arrivalTime) {
        occupiedUntil.delete(spotId);
      }
    }

    const spot = spots.find((candidate) => !occupiedUntil.has(candidate.id));

    if (!spot) {
      assignments.push({
        vehicleId: vehicle.vehicleId,
        arrivalTime: vehicle.arrivalTime,
        departureTime: null,
        spotId: null,
        distance: null,
      });
      continue;
    }

    const departureTime = vehicle.arrivalTime + vehicle.duration;
    occupiedUntil.set(spot.id, departureTime);
    assignments.push({
      vehicleId: vehicle.vehicleId,
      arrivalTime: vehicle.arrivalTime,
      departureTime,
      spotId: spot.id,
      distance: spot.distance,
    });
  }

  const assigned = assignments.filter(
    (
      assignment,
    ): assignment is Assignment & {
      departureTime: number;
      spotId: number;
      distance: number;
    } => assignment.spotId !== null,
  );
  const totalDistance = assigned.reduce(
    (sum, assignment) => sum + assignment.distance,
    0,
  );
  const occupancyArea = assigned.reduce(
    (sum, assignment) =>
      sum + (assignment.departureTime - assignment.arrivalTime),
    0,
  );
  const simulationStart = Math.min(
    ...vehicles.map((vehicle) => vehicle.arrivalTime),
  );
  const lastArrival = Math.max(
    ...vehicles.map((vehicle) => vehicle.arrivalTime),
  );
  const lastDeparture = assigned.reduce(
    (latest, assignment) => Math.max(latest, assignment.departureTime),
    simulationStart,
  );
  const simulationEnd = Math.max(lastArrival, lastDeparture);
  const simulationDuration = simulationEnd - simulationStart;

  return {
    totalVehicles: vehicles.length,
    averageDistance:
      assigned.length === 0 ? 0 : totalDistance / assigned.length,
    averageOccupancyRate:
      simulationDuration === 0
        ? 0
        : (occupancyArea / (PARKING_CAPACITY * simulationDuration)) * 100,
    assignments,
  };
}
