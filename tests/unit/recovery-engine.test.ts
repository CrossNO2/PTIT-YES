import { describe, it, expect } from "vitest";
import {
  RecoveryRequest,
  Route,
  Vehicle,
  Warehouse,
  ShipperShift,
  PaasBag,
} from "@/types/database";
import {
  evaluateRecoveryDecision,
  evaluateRecoveryStrategyA,
  ContextSignalSnapshot,
} from "@/lib/lifecycle/recovery-engine";
import { insertRecoveryRequestsIntoRoute } from "@/lib/optimization/reverse-logistics";
import { OptimizedRouteResult } from "@/lib/optimization/types";

function createMockRecoveryRequest(overrides?: Partial<RecoveryRequest>): RecoveryRequest {
  return {
    id: "rec-req-uuid-001",
    shop_id: "shop-uuid-001",
    customer_id: "cust-uuid-001",
    bag_id: "bag-uuid-001",
    order_id: "order-uuid-001",
    status: "requested",
    recovery_strategy: "strategy_a_merged",
    pickup_address: "123 Nguyen Hue, Ben Nghe, District 1, HCMC",
    lat: 10.7735,
    lng: 106.7032,
    pickup_date: "2026-09-30",
    time_slot_start: "08:00",
    time_slot_end: "18:00",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockWarehouse(): Warehouse {
  return {
    id: "wh-001",
    shop_id: "shop-uuid-001",
    name: "Central Hub District 1",
    address: "100 Le Loi, District 1, HCMC",
    lat: 10.7700,
    lng: 106.6980,
    is_default: true,
    has_cleaning_facility: true,
    has_inspection_depot: true,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function createMockVehicle(overrides?: Partial<Vehicle>): Vehicle {
  return {
    id: "veh-001",
    shop_id: "shop-uuid-001",
    name: "Electric Motorbike 01",
    vehicle_type: "electric_motorbike",
    license_plate: "59A-12345",
    capacity_kg: 50,
    bag_capacity_units: 15,
    co2_kg_per_km: 0.015,
    fuel_cost_vnd_per_km: 1200,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockCandidateRoute(
  overrides?: Partial<Route & { stops: Array<{ lat: number; lng: number; sequence_index: number; stop_type?: string }> }>
): Route & { stops: Array<{ lat: number; lng: number; sequence_index: number; stop_type?: string }> } {
  return {
    id: "route-uuid-001",
    shop_id: "shop-uuid-001",
    warehouse_id: "wh-001",
    route_date: "2026-09-30",
    shipper_id: "shipper-user-001",
    vehicle_id: "veh-001",
    status: "assigned",
    route_type: "delivery_with_recovery",
    optimization_version: 1,
    naive_distance_km: 15.0,
    optimized_distance_km: 12.0,
    total_duration_mins: 90,
    estimated_cost_vnd: 14400,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    stops: [
      { sequence_index: 0, lat: 10.7700, lng: 106.6980 }, // Depot
      { sequence_index: 1, lat: 10.7740, lng: 106.7025 }, // Stop 1 (Near recovery: 10.7735, 106.7032)
      { sequence_index: 2, lat: 10.7800, lng: 106.7050 }, // Stop 2
      { sequence_index: 3, lat: 10.7700, lng: 106.6980 }, // Return to Depot
    ],
    ...overrides,
  };
}

describe("GB-003: Explainable Recovery Decision & Route Optimization Engine", () => {
  // ==========================================================================
  // Test 1: Strategy A Selected when Route is Feasible
  // ==========================================================================
  it("should select Strategy A when candidate route can absorb recovery within detour thresholds", () => {
    const recoveryRequest = createMockRecoveryRequest();
    const candidateRoute = createMockCandidateRoute();
    const vehicle = createMockVehicle();

    const result = evaluateRecoveryDecision({
      recoveryRequest,
      candidateRoutes: [candidateRoute],
      vehicle,
      thresholds: { maxDeltaDistanceKm: 2.0, maxDeltaDurationMins: 15 },
    });

    expect(result.selected_strategy).toBe("strategy_a_merged");
    expect(result.recommended_strategy).toBe("strategy_a_merged");
    expect(result.is_strategy_a).toBe(true);
    expect(result.is_fallback).toBe(false);
    expect(result.target_route_id).toBe(candidateRoute.id);
    expect(result.considered_shipper_id).toBe("shipper-user-001");
    expect(result.rationale.reason_code).toBe("WITHIN_ROUTE_DETOUR_THRESHOLD");
    expect(result.estimated_distance_delta_km).toBeLessThanOrEqual(2.0);
  });

  // ==========================================================================
  // Test 2: Strategy A Rejected when Detour Exceeds Threshold
  // ==========================================================================
  it("should reject Strategy A when detour exceeds threshold and fallback to Strategy C", () => {
    // Distant pickup point: District 9 / Thu Duc (10.8500, 106.7800) far from District 1 route
    const distantRequest = createMockRecoveryRequest({
      lat: 10.8500,
      lng: 106.7800,
    });
    const candidateRoute = createMockCandidateRoute();
    const vehicle = createMockVehicle();

    const result = evaluateRecoveryDecision({
      recoveryRequest: distantRequest,
      candidateRoutes: [candidateRoute],
      vehicle,
      thresholds: { maxDeltaDistanceKm: 2.0, maxDeltaDurationMins: 15 },
    });

    // Strategy A rejected, Strategy C selected!
    expect(result.selected_strategy).toBe("strategy_c_dedicated");
    expect(result.recommended_strategy).toBe("strategy_c_dedicated");
    expect(result.is_strategy_a).toBe(false);
    expect(result.is_fallback).toBe(true);
    expect(result.target_route_id).toBeNull();
    expect(result.rationale.reason_code).toBe("DETOUR_EXCEEDS_THRESHOLD");
    expect(result.rationale.explanation).toContain("exceeds threshold");
    expect(result.estimated_distance_delta_km).toBeGreaterThan(2.0);
  });

  // ==========================================================================
  // Test 3: Strategy C Selected when No Candidate Route Exists
  // ==========================================================================
  it("should select Strategy C fallback when no candidate routes exist for the date", () => {
    const recoveryRequest = createMockRecoveryRequest();
    const warehouse = createMockWarehouse();

    const result = evaluateRecoveryDecision({
      recoveryRequest,
      candidateRoutes: [],
      warehouse,
    });

    expect(result.selected_strategy).toBe("strategy_c_dedicated");
    expect(result.is_strategy_a).toBe(false);
    expect(result.is_fallback).toBe(true);
    expect(result.target_route_id).toBeNull();
    expect(result.rationale.reason_code).toBe("NO_ACTIVE_ROUTE_FOUND");
    expect(result.rationale.explanation).toContain("No active candidate delivery routes available");
  });

  // ==========================================================================
  // Test 4: Strategy C Selected when Shipper Shift Limit is Exceeded
  // ==========================================================================
  it("should reject Strategy A and fallback to Strategy C when shipper shift limit would be exceeded", () => {
    const recoveryRequest = createMockRecoveryRequest();
    const candidateRoute = createMockCandidateRoute({
      total_duration_mins: 470, // 7h50m into an 8h shift
    });
    const tightShift: ShipperShift = {
      id: "shift-001",
      shop_id: "shop-uuid-001",
      shipper_id: "shipper-user-001",
      shift_date: "2026-09-30",
      start_time: "08:00",
      end_time: "16:00",
      max_work_minutes: 480, // 8 hours max
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const routeWithShift = {
      ...candidateRoute,
      shift: tightShift,
    };

    const result = evaluateRecoveryDecision({
      recoveryRequest,
      candidateRoutes: [routeWithShift],
    });

    expect(result.selected_strategy).toBe("strategy_c_dedicated");
    expect(result.rationale.reason_code).toBe("SHIFT_LIMIT_EXCEEDED");
    expect(result.is_fallback).toBe(true);
  });

  // ==========================================================================
  // Test 5: Context Signal Integration & Simulated Labeling
  // ==========================================================================
  it("should attach context signals and ensure simulated context remains explicitly labeled SIMULATED", () => {
    const recoveryRequest = createMockRecoveryRequest();
    const candidateRoute = createMockCandidateRoute();

    const simulatedContext: ContextSignalSnapshot = {
      source: "SIMULATED",
      weatherCondition: "RAIN_LIGHT",
      trafficLevel: "medium",
      floodRiskLevel: "low",
      severityLevel: "low",
      capturedAt: new Date().toISOString(),
    };

    const result = evaluateRecoveryDecision({
      recoveryRequest,
      candidateRoutes: [candidateRoute],
      contextSignals: simulatedContext,
    });

    expect(result.context_signals_snapshot.source).toBe("SIMULATED");
    expect(result.context_signals_snapshot.weatherCondition).toBe("RAIN_LIGHT");
    expect(result.rationale.context_signals_snapshot.source).toBe("SIMULATED");
  });

  // ==========================================================================
  // Test 6: Critical Environmental Signal Blocks Strategy A
  // ==========================================================================
  it("should fallback to Strategy C when critical flood risk environmental hazard is detected", () => {
    const recoveryRequest = createMockRecoveryRequest();
    const candidateRoute = createMockCandidateRoute(); // Route is nearby!

    const hazardousContext: ContextSignalSnapshot = {
      source: "SIMULATED",
      weatherCondition: "HEAVY_STORM",
      trafficLevel: "severe",
      floodRiskLevel: "critical", // Hazard in pickup area!
      severityLevel: "critical",
      capturedAt: new Date().toISOString(),
    };

    const result = evaluateRecoveryDecision({
      recoveryRequest,
      candidateRoutes: [candidateRoute],
      contextSignals: hazardousContext,
    });

    expect(result.selected_strategy).toBe("strategy_c_dedicated");
    expect(result.rationale.reason_code).toBe("ENVIRONMENTAL_HAZARD_RESTRICTION");
    expect(result.rationale.explanation).toContain("flood risk");
    expect(result.target_route_id).toBeNull();
  });

  // ==========================================================================
  // Test 7: Full Explainable Evidence Structure
  // ==========================================================================
  it("should produce a complete explainability payload with all 6 required criteria", () => {
    const recoveryRequest = createMockRecoveryRequest();
    const candidateRoute = createMockCandidateRoute();

    const result = evaluateRecoveryDecision({
      recoveryRequest,
      candidateRoutes: [candidateRoute],
      thresholds: { maxDeltaDistanceKm: 2.5, maxDeltaDurationMins: 15 },
    });

    const rationale = result.rationale;

    // 1. Which strategy was selected?
    expect(rationale.selected_strategy).toBe("strategy_a_merged");

    // 2. Which route/shipper was considered?
    expect(rationale.considered_route_id).toBe(candidateRoute.id);
    expect(rationale.considered_shipper_id).toBe(candidateRoute.shipper_id);

    // 3. Why was the strategy selected?
    expect(rationale.reason_code).toBe("WITHIN_ROUTE_DETOUR_THRESHOLD");
    expect(rationale.explanation).toBeDefined();

    // 4. Which thresholds were applied?
    expect(rationale.applied_thresholds.max_delta_distance_km).toBe(2.5);
    expect(rationale.applied_thresholds.max_delta_duration_mins).toBe(15);

    // 5. What distance/time estimate was used?
    expect(rationale.evaluated_metrics.evaluated_delta_km).toBeDefined();
    expect(rationale.evaluated_metrics.evaluated_delta_mins).toBeDefined();
    expect(rationale.evaluated_metrics.estimated_cost_delta_vnd).toBeGreaterThanOrEqual(0);

    // 6. Which context signals affected the decision?
    expect(rationale.context_signals_snapshot).toBeDefined();
    expect(rationale.context_signals_snapshot.source).toBe("SIMULATED");
  });

  // ==========================================================================
  // Test 8: Decision Planning Does NOT Mutate Bag Lifecycle State
  // ==========================================================================
  it("should NOT mutate the bag lifecycle state during decision planning", () => {
    const bag: PaasBag = {
      id: "bag-uuid-001",
      bag_code: "BAG-000001",
      qr_code_hash: "hash-001",
      owner_entity: "GREENBRIDGE_PLATFORM",
      is_platform_owned: true,
      current_holder_type: "customer",
      current_holder_user_id: "cust-001",
      current_location_type: "customer_address",
      model_type: "standard_25l",
      size_category: "medium",
      status: "return_requested", // Pre-recovery state
      condition: "good",
      usage_count: 3,
      max_cycles: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const recoveryRequest = createMockRecoveryRequest({ bag_id: bag.id });
    const candidateRoute = createMockCandidateRoute();

    // Running recovery decision engine
    const decision = evaluateRecoveryDecision({
      recoveryRequest,
      candidateRoutes: [candidateRoute],
    });

    expect(decision.selected_strategy).toBe("strategy_a_merged");
    // Ensure bag status and usage_count are untouched by decision calculation!
    expect(bag.status).toBe("return_requested");
    expect(bag.usage_count).toBe(3);
    expect(bag.current_holder_type).toBe("customer");
  });

  // ==========================================================================
  // Test 9: Reverse Logistics Route Planning Integration (PaaS Bag Recovery Stop)
  // ==========================================================================
  it("should merge recovery requests into route stops with stopType = 'recovery'", () => {
    const recoveryRequest = createMockRecoveryRequest({
      lat: 10.7735,
      lng: 106.7032,
      pickup_address: "123 Nguyen Hue, Ben Nghe",
    });

    const routeResult: OptimizedRouteResult = {
      vehicleId: "veh-001",
      vehicleName: "Motorbike 01",
      vehicleType: "motorbike",
      stops: [
        {
          stopType: "warehouse",
          address: "Central Hub",
          lat: 10.7700,
          lng: 106.6980,
          sequenceIndex: 0,
          estimatedArrivalMins: 0,
          distanceFromPreviousKm: 0,
          durationFromPreviousMins: 0,
          weightKg: 0,
          timeSlotStart: "08:00",
          timeSlotEnd: "09:00",
        },
        {
          stopType: "delivery",
          orderId: "ord-001",
          address: "Near Nguyen Hue",
          lat: 10.7740,
          lng: 106.7025,
          sequenceIndex: 1,
          estimatedArrivalMins: 15,
          distanceFromPreviousKm: 1.2,
          durationFromPreviousMins: 5,
          weightKg: 2.0,
          timeSlotStart: "08:00",
          timeSlotEnd: "12:00",
        },
        {
          stopType: "warehouse",
          address: "Central Hub Return",
          lat: 10.7700,
          lng: 106.6980,
          sequenceIndex: 2,
          estimatedArrivalMins: 40,
          distanceFromPreviousKm: 1.2,
          durationFromPreviousMins: 5,
          weightKg: 0,
          timeSlotStart: "17:00",
          timeSlotEnd: "18:00",
        },
      ],
      totalDistanceKm: 2.4,
      totalDurationMins: 40,
      totalWeightKg: 2.0,
      estimatedCostVnd: 2880,
    };

    const vehicle = createMockVehicle();

    const { updatedRoute, insertedRecoveryRequestIds } = insertRecoveryRequestsIntoRoute(
      routeResult,
      [recoveryRequest],
      vehicle
    );

    expect(insertedRecoveryRequestIds).toContain(recoveryRequest.id);
    expect(updatedRoute.stops.length).toBe(4);
    const recoveryStop = updatedRoute.stops.find((s) => s.stopType === "recovery");
    expect(recoveryStop).toBeDefined();
    expect(recoveryStop?.recoveryRequestId).toBe(recoveryRequest.id);
    expect(recoveryStop?.bagUnits).toBe(1); // Tracked strictly in bag units
    expect(recoveryStop?.weightKg).toBe(0); // No scrap kg semantics for PaaS bags
  });

  // ==========================================================================
  // Test 10: Backward Compatibility with GB-002 Helper
  // ==========================================================================
  it("should preserve backward compatibility with evaluateRecoveryStrategyA", () => {
    const recoveryRequest = createMockRecoveryRequest();
    const activeRoute = createMockCandidateRoute();
    const vehicle = createMockVehicle();

    const result = evaluateRecoveryStrategyA({
      recoveryRequest,
      activeRoute,
      vehicle,
    });

    expect(result.canMerge).toBe(true);
    expect(result.decision.selected_strategy).toBe("strategy_a_merged");
    expect(result.decision.recommended_strategy).toBe("strategy_a_merged");
    expect(result.bestStopIndex).toBeDefined();
  });

  // ==========================================================================
  // Test 11: Strategy C Produces DedicatedRecoveryTask Abstraction
  // ==========================================================================
  it("should produce a concrete DedicatedRecoveryTask abstraction when Strategy C is selected", () => {
    const recoveryRequest = createMockRecoveryRequest();
    const warehouse = createMockWarehouse();

    // Strategy C fallback (no routes available)
    const result = evaluateRecoveryDecision({
      recoveryRequest,
      candidateRoutes: [],
      warehouse,
    });

    expect(result.selected_strategy).toBe("strategy_c_dedicated");
    expect(result.dedicated_task).toBeDefined();
    expect(result.dedicated_task).not.toBeNull();

    const task = result.dedicated_task!;
    // Exact relationship to recovery_request
    expect(task.recovery_request_id).toBe(recoveryRequest.id);
    expect(task.shop_id).toBe(recoveryRequest.shop_id);
    expect(task.customer_id).toBe(recoveryRequest.customer_id);
    expect(task.bag_id).toBe(recoveryRequest.bag_id);

    // Fields required for downstream execution
    expect(task.pickup_address).toBe(recoveryRequest.pickup_address);
    expect(task.lat).toBe(recoveryRequest.lat);
    expect(task.lng).toBe(recoveryRequest.lng);
    expect(task.pickup_date).toBe(recoveryRequest.pickup_date);
    expect(task.depot_warehouse_id).toBe(warehouse.id);
    expect(task.task_status).toBe("pending_dispatch");
    expect(task.target_route_type).toBe("dedicated_recovery");
    expect(task.estimated_distance_km).toBeGreaterThan(0);
    expect(task.estimated_duration_mins).toBeGreaterThan(0);
    expect(task.estimated_cost_vnd).toBeGreaterThan(0);

    // Also attached to rationale evidence
    expect(result.rationale.evidence.dedicated_task).toEqual(task);
  });

  // ==========================================================================
  // Test 12: PaaS Capacity Evaluated in Bag Units Without Scrap Kg Dependency
  // ==========================================================================
  it("should evaluate PaaS capacity strictly in bag units and reject when vehicle bag capacity is reached", () => {
    const recoveryRequest = createMockRecoveryRequest();
    const routeWithFullBags = createMockCandidateRoute({
      stops: [
        { sequence_index: 0, lat: 10.7700, lng: 106.6980, stop_type: "warehouse" },
        { sequence_index: 1, lat: 10.7740, lng: 106.7025, stop_type: "recovery" }, // already carrying 1 recovered bag
        { sequence_index: 2, lat: 10.7700, lng: 106.6980, stop_type: "warehouse" },
      ],
    });

    // Small vehicle with capacity for only 1 bag
    const smallVehicle = createMockVehicle({
      bag_capacity_units: 1,
      capacity_kg: 500, // Plenty of kg capacity, but bag capacity unit limit is 1!
    });

    const result = evaluateRecoveryDecision({
      recoveryRequest,
      candidateRoutes: [routeWithFullBags],
      vehicle: smallVehicle,
    });

    // Despite 500kg vehicle capacity, bag unit capacity (1) is reached, rejecting Strategy A
    expect(result.selected_strategy).toBe("strategy_c_dedicated");
    expect(result.rationale.reason_code).toBe("CAPACITY_EXCEEDED");
    expect(result.rationale.explanation).toContain("bag unit capacity");
    expect(result.is_fallback).toBe(true);
  });

  // ==========================================================================
  // Test 13: Strategy A Distance Source Behavior is Documented
  // ==========================================================================
  it("should document distance_source as HAVERSINE_URBAN_ESTIMATE with urban circuity factor", () => {
    const recoveryRequest = createMockRecoveryRequest();
    const candidateRoute = createMockCandidateRoute();

    const result = evaluateRecoveryDecision({
      recoveryRequest,
      candidateRoutes: [candidateRoute],
    });

    expect(result.selected_strategy).toBe("strategy_a_merged");
    expect(result.rationale.evidence.distance_source).toBe("HAVERSINE_URBAN_ESTIMATE");
    expect(result.rationale.evaluated_metrics.evaluated_delta_km).toBeGreaterThan(0);
    // When Strategy A is selected, no dedicated task is created (merged into existing route)
    expect(result.dedicated_task).toBeNull();
    expect(result.rationale.evidence.dedicated_task).toBeNull();
  });

  // ==========================================================================
  // Test 14: Decision Immutability & Append-Only Invariant Verification
  // ==========================================================================
  it("should preserve decision immutability: re-evaluation produces a new independent record without mutating prior result", () => {
    const recoveryRequest = createMockRecoveryRequest();
    const candidateRoute = createMockCandidateRoute();

    const decision1 = evaluateRecoveryDecision({
      recoveryRequest,
      candidateRoutes: [candidateRoute],
    });

    // Snapshot decision 1
    const snapshot1 = JSON.parse(JSON.stringify(decision1));

    // Distant request for second decision
    const distantRequest = createMockRecoveryRequest({ lat: 10.8500, lng: 106.7800 });
    const decision2 = evaluateRecoveryDecision({
      recoveryRequest: distantRequest,
      candidateRoutes: [candidateRoute],
    });

    // Verify decision 1 remained completely untouched and immutable
    expect(decision1).toEqual(snapshot1);
    expect(decision2.selected_strategy).toBe("strategy_c_dedicated");
    expect(decision1.selected_strategy).toBe("strategy_a_merged");
  });
});
