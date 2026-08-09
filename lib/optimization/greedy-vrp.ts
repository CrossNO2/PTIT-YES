import { Order, Vehicle, Warehouse, ShipperShift } from "@/types/database";
import {
  LocationPoint,
  OptimizationOutput,
  OptimizationRejection,
  OptimizedRouteResult,
  OptimizedStop,
} from "./types";
import { computeDistanceMatrix } from "./distance-matrix";
import { runTwoOptOptimization, calculateRouteDistanceKm, recalculateStopsMetrics } from "./two-opt";
import { OPTIMIZATION_CONFIG } from "./config";

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

function formatMinutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export async function runOptimizationEngine(
  warehouse: Warehouse,
  orders: Order[],
  vehicles: Vehicle[],
  shifts?: ShipperShift[]
): Promise<OptimizationOutput> {
  const unassignedOrders: OptimizationRejection[] = [];
  const validOrders: Order[] = [];

  // 1. Initial Validation & Filtering
  const maxVehicleCapacity = Math.max(...vehicles.map((v) => v.capacity_kg), 100);

  for (const order of orders) {
    if (!order.lat || !order.lng || (order.lat === 0 && order.lng === 0)) {
      unassignedOrders.push({
        orderId: order.id,
        orderCode: order.order_code,
        reason: "INVALID_COORDINATES",
        message: `Đơn hàng ${order.order_code} chưa có tọa độ (lat/lng) hợp lệ`,
      });
      continue;
    }

    if (order.weight_kg > maxVehicleCapacity) {
      unassignedOrders.push({
        orderId: order.id,
        orderCode: order.order_code,
        reason: "CAPACITY_EXCEEDED",
        message: `Khối lượng đơn ${order.weight_kg}kg vượt tải trọng tối đa của mọi phương tiện (${maxVehicleCapacity}kg)`,
      });
      continue;
    }

    validOrders.push(order);
  }

  // 2. Prepare Distance Matrix Locations
  const locationPoints: LocationPoint[] = [
    { id: "wh", lat: warehouse.lat, lng: warehouse.lng, address: warehouse.address },
    ...validOrders.map((o) => ({ id: o.id, lat: o.lat, lng: o.lng, address: o.address })),
  ];

  const pointIndexMap = new Map<string, number>();
  locationPoints.forEach((p, idx) => pointIndexMap.set(p.id, idx));

  const matrixMap = await computeDistanceMatrix(locationPoints);

  // 3. Naive Baseline Calculation (Creation Order Baseline: CREATION_ORDER_V1)
  let naiveDistanceKm = 0;
  if (validOrders.length > 0) {
    const sortedNaive = [...validOrders].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    let currentIdx = 0; // warehouse
    for (const ord of sortedNaive) {
      const targetIdx = pointIndexMap.get(ord.id) ?? 0;
      const cell = matrixMap.get(`${currentIdx}-${targetIdx}`);
      if (cell) {
        naiveDistanceKm += cell.distanceMeters / 1000;
      }
      currentIdx = targetIdx;
    }
    // Return to warehouse
    const returnCell = matrixMap.get(`${currentIdx}-0`);
    if (returnCell) {
      naiveDistanceKm += returnCell.distanceMeters / 1000;
    }
  }
  naiveDistanceKm = Number(naiveDistanceKm.toFixed(2));

  // 4. Greedy VRP Route Construction
  const activeVehicles = vehicles.filter((v) => v.status === "active");
  const remainingOrderIds = new Set(validOrders.map((o) => o.id));
  const orderMap = new Map(validOrders.map((o) => [o.id, o]));
  const routes: OptimizedRouteResult[] = [];

  for (const vehicle of activeVehicles) {
    if (remainingOrderIds.size === 0) break;

    const routeStops: OptimizedStop[] = [];
    let currentCapacity = 0;
    let currentLocationId = "wh";
    let currentTimeMins = 8 * 60; // 08:00 AM

    // Add warehouse start stop
    routeStops.push({
      stopType: "warehouse",
      address: warehouse.address,
      lat: warehouse.lat,
      lng: warehouse.lng,
      sequenceIndex: 0,
      estimatedArrivalMins: currentTimeMins,
      distanceFromPreviousKm: 0,
      durationFromPreviousMins: 0,
      weightKg: 0,
      timeSlotStart: "08:00",
      timeSlotEnd: "18:00",
    });

    while (remainingOrderIds.size > 0) {
      let bestCandidateId: string | null = null;
      let lowestScore = Infinity;

      for (const orderId of remainingOrderIds) {
        const order = orderMap.get(orderId)!;

        // Capacity constraint check
        if (currentCapacity + order.weight_kg > vehicle.capacity_kg) {
          continue;
        }

        const fromIdx = pointIndexMap.get(currentLocationId) ?? 0;
        const toIdx = pointIndexMap.get(orderId) ?? 0;
        const cell = matrixMap.get(`${fromIdx}-${toIdx}`) || { distanceMeters: 5000, durationSeconds: 600 };

        const travelMins = Math.round(cell.durationSeconds / 60);
        const arrivalMins = currentTimeMins + travelMins;

        const startMins = parseTimeToMinutes(order.time_slot_start);
        const endMins = parseTimeToMinutes(order.time_slot_end);

        // Lateness penalty
        const latenessMins = Math.max(0, arrivalMins - endMins);
        // Waiting penalty
        const waitingMins = Math.max(0, startMins - arrivalMins);

        // Priority penalty (1 = highest, 5 = lowest)
        const priorityPenalty = (order.priority - 1) * 10;

        const normalizedDist = cell.distanceMeters / 1000;

        const { distanceWeight, latenessPenaltyWeight, waitingPenaltyWeight, priorityPenaltyWeight } =
          OPTIMIZATION_CONFIG.weights;

        const score =
          distanceWeight * normalizedDist +
          latenessPenaltyWeight * latenessMins +
          waitingPenaltyWeight * waitingMins +
          priorityPenaltyWeight * priorityPenalty;

        if (score < lowestScore) {
          lowestScore = score;
          bestCandidateId = orderId;
        }
      }

      if (!bestCandidateId) break; // No candidate fits current vehicle capacity/constraints

      const selectedOrder = orderMap.get(bestCandidateId)!;
      remainingOrderIds.delete(bestCandidateId);

      const fromIdx = pointIndexMap.get(currentLocationId) ?? 0;
      const toIdx = pointIndexMap.get(bestCandidateId) ?? 0;
      const cell = matrixMap.get(`${fromIdx}-${toIdx}`) || { distanceMeters: 5000, durationSeconds: 600 };

      const distKm = Number((cell.distanceMeters / 1000).toFixed(2));
      const durMins = Math.round(cell.durationSeconds / 60);

      currentTimeMins += durMins + OPTIMIZATION_CONFIG.defaultServiceTimeMins;
      currentCapacity += selectedOrder.weight_kg;
      currentLocationId = bestCandidateId;

      routeStops.push({
        stopType: "delivery",
        orderId: selectedOrder.id,
        orderCode: selectedOrder.order_code,
        address: selectedOrder.address,
        lat: selectedOrder.lat,
        lng: selectedOrder.lng,
        sequenceIndex: routeStops.length,
        estimatedArrivalMins: currentTimeMins,
        distanceFromPreviousKm: distKm,
        durationFromPreviousMins: durMins,
        weightKg: selectedOrder.weight_kg,
        timeSlotStart: selectedOrder.time_slot_start,
        timeSlotEnd: selectedOrder.time_slot_end,
      });
    }

    if (routeStops.length > 1) {
      // Close the route back at the warehouse so distance/cost/2-opt include the return leg.
      routeStops.push({
        stopType: "warehouse",
        address: warehouse.address,
        lat: warehouse.lat,
        lng: warehouse.lng,
        sequenceIndex: routeStops.length,
        estimatedArrivalMins: currentTimeMins,
        distanceFromPreviousKm: 0,
        durationFromPreviousMins: 0,
        weightKg: 0,
        timeSlotStart: "08:00",
        timeSlotEnd: "18:00",
      });
      recalculateStopsMetrics(routeStops, matrixMap, pointIndexMap);

      // 5. Run 2-Opt Local Improvement while keeping warehouse endpoints fixed.
      const optimizedStops = runTwoOptOptimization(routeStops, matrixMap, pointIndexMap);
      recalculateStopsMetrics(optimizedStops, matrixMap, pointIndexMap);
      const routeDistanceKm = calculateRouteDistanceKm(optimizedStops);
      const totalDurMins = optimizedStops.reduce((acc, s) => acc + s.durationFromPreviousMins, 0);

      routes.push({
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        vehicleType: vehicle.vehicle_type,
        stops: optimizedStops,
        totalDistanceKm: routeDistanceKm,
        totalDurationMins: totalDurMins,
        totalWeightKg: currentCapacity,
        estimatedCostVnd: routeDistanceKm * vehicle.fuel_cost_vnd_per_km,
      });
    }
  }

  // Record remaining unassigned orders with specific reasons
  for (const remainingId of remainingOrderIds) {
    const o = orderMap.get(remainingId)!;
    unassignedOrders.push({
      orderId: o.id,
      orderCode: o.order_code,
      reason: "SHIFT_EXCEEDED",
      message: `Đơn ${o.order_code} không thể xếp vào phương tiện do hết tải trọng hoặc thời gian ca làm việc`,
    });
  }

  const optimizedDistanceKm = Number(routes.reduce((acc, r) => acc + r.totalDistanceKm, 0).toFixed(2));
  const totalKmSaved = Number(Math.max(0, naiveDistanceKm - optimizedDistanceKm).toFixed(2));

  const sampleVehicle = vehicles[0] || { co2_kg_per_km: 0.1500, fuel_cost_vnd_per_km: 3000 };
  const estimatedCo2SavedKg = Number((totalKmSaved * sampleVehicle.co2_kg_per_km).toFixed(4));
  const estimatedCostSavedVnd = Number((totalKmSaved * sampleVehicle.fuel_cost_vnd_per_km).toFixed(2));

  return {
    routes,
    unassignedOrders,
    naiveDistanceKm,
    optimizedDistanceKm,
    totalKmSaved,
    estimatedCo2SavedKg,
    estimatedCostSavedVnd,
    baselineMethod: "CREATION_ORDER_V1",
  };
}
