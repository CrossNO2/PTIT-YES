import { Order, Vehicle, Warehouse, ShipperShift } from "@/types/database";

export type LocationPoint = {
  id: string;
  lat: number;
  lng: number;
  address?: string;
};

export type MatrixCell = {
  originIndex: number;
  destinationIndex: number;
  distanceMeters: number;
  durationSeconds: number;
};

export type DistanceMatrixMap = Map<string, { distanceMeters: number; durationSeconds: number }>;

export type OptimizationRejectionReason =
  | "INVALID_COORDINATES"
  | "GEOCODING_FAILED"
  | "OUTSIDE_SERVICE_AREA"
  | "INVALID_TIME_WINDOW"
  | "CAPACITY_EXCEEDED"
  | "SHIFT_EXCEEDED";

export type OptimizationRejection = {
  orderId: string;
  orderCode: string;
  reason: OptimizationRejectionReason;
  message: string;
};

export type OptimizedStop = {
  stopType: "warehouse" | "delivery" | "pickup";
  orderId?: string;
  pickupId?: string;
  orderCode?: string;
  address: string;
  lat: number;
  lng: number;
  sequenceIndex: number;
  estimatedArrivalMins: number;
  distanceFromPreviousKm: number;
  durationFromPreviousMins: number;
  weightKg: number;
  timeSlotStart: string;
  timeSlotEnd: string;
};

export type OptimizedRouteResult = {
  vehicleId: string;
  vehicleName: string;
  vehicleType: string;
  shipperId?: string;
  shipperName?: string;
  stops: OptimizedStop[];
  totalDistanceKm: number;
  totalDurationMins: number;
  totalWeightKg: number;
  estimatedCostVnd: number;
};

export type OptimizationOutput = {
  routes: OptimizedRouteResult[];
  unassignedOrders: OptimizationRejection[];
  naiveDistanceKm: number;
  optimizedDistanceKm: number;
  totalKmSaved: number;
  estimatedCo2SavedKg: number;
  estimatedCostSavedVnd: number;
  baselineMethod: "CREATION_ORDER_V1";
};
