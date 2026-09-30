import { describe, it, expect } from "vitest";
import {
  PaasBag,
  RecoveryRequest,
  Route,
  Vehicle,
} from "@/types/database";
import {
  requestBagRecovery,
  startBagRecovery,
  completeBagRecovery,
  startBagInspection,
  completeBagInspectionWashing,
  returnBagToStock,
} from "@/lib/lifecycle/bag-lifecycle-engine";
import { evaluateRecoveryDecision } from "@/lib/lifecycle/recovery-engine";

function createMockBag(overrides?: Partial<PaasBag>): PaasBag {
  return {
    id: "bag-uuid-001",
    bag_code: "BAG-000001",
    qr_code_hash: "hash-000001",
    owner_entity: "GREENBRIDGE_PLATFORM",
    is_platform_owned: true,
    current_shop_id: "shop-uuid-001",
    current_holder_type: "customer",
    current_holder_user_id: "customer-user-123",
    current_location_type: "customer_address",
    current_warehouse_id: null,
    current_pudo_id: null,
    model_type: "standard_25l",
    size_category: "medium",
    status: "with_customer",
    condition: "good",
    usage_count: 3,
    max_cycles: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockRecoveryRequest(overrides?: Partial<RecoveryRequest>): RecoveryRequest {
  return {
    id: "rec-req-uuid-001",
    shop_id: "shop-uuid-001",
    customer_id: "customer-user-123",
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
      { sequence_index: 0, lat: 10.7700, lng: 106.6980 },
      { sequence_index: 1, lat: 10.7740, lng: 106.7025 },
      { sequence_index: 2, lat: 10.7800, lng: 106.7050 },
      { sequence_index: 3, lat: 10.7700, lng: 106.6980 },
    ],
    ...overrides,
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

describe("GB-004 Operational Flows & Vertical Slice Tests", () => {
  // =========================================================================
  // 1. Customer Custody & Recovery Request Creation
  // =========================================================================
  describe("1. Customer Custody & Recovery Request", () => {
    it("should allow customer holding the bag to request recovery (with_customer -> return_requested)", () => {
      const bag = createMockBag({
        status: "with_customer",
        current_holder_user_id: "customer-user-123",
      });

      const { updatedBag, recoveryRequestId } = requestBagRecovery(bag, false);

      expect(updatedBag.status).toBe("return_requested");
      expect(updatedBag.current_holder_type).toBe("customer");
      expect(recoveryRequestId).toBeDefined();
      // Critical invariant: usage_count MUST NOT increment on recovery request
      expect(updatedBag.usage_count).toBe(3);
    });

    it("should reject recovery request if bag is not in with_customer status", () => {
      const bag = createMockBag({
        status: "available",
      });

      expect(() => {
        requestBagRecovery(bag, false);
      }).toThrow(/INVALID_BAG_STATE/);
    });

    it("should enforce idempotency by rejecting recovery request if bag already has active recovery", () => {
      const bag = createMockBag({
        status: "with_customer",
        current_holder_user_id: "customer-user-123",
      });

      expect(() => {
        requestBagRecovery(bag, true); // hasActiveRecovery = true
      }).toThrow(/DUPLICATE_ACTIVE_RECOVERY_REQUEST/);
    });
  });

  // =========================================================================
  // 2. Integration with GB-003 Decision Engine
  // =========================================================================
  describe("2. Recovery Decision Engine Evaluation on Request", () => {
    it("should evaluate Strategy A when nearby active route is feasible", () => {
      const recoveryRequest = createMockRecoveryRequest();
      const candidateRoute = createMockCandidateRoute();
      const vehicle = createMockVehicle();

      const decision = evaluateRecoveryDecision({
        recoveryRequest,
        candidateRoutes: [candidateRoute],
        vehicle,
        thresholds: { maxDeltaDistanceKm: 2.0, maxDeltaDurationMins: 15 },
      });

      expect(decision.recommended_strategy).toBe("strategy_a_merged");
      expect(decision.selected_strategy).toBe("strategy_a_merged");
      expect(decision.target_route_id).toBe(candidateRoute.id);
      expect(decision.rationale.reason_code).toBe("WITHIN_ROUTE_DETOUR_THRESHOLD");
      // Dedicated task is NOT created for Strategy A
      expect(decision.dedicated_task).toBeNull();
    });

    it("should fallback to Strategy C and produce dedicated recovery task when Strategy A is infeasible", () => {
      const recoveryRequest = createMockRecoveryRequest({
        lat: 10.9000, // Very far away
        lng: 106.9000,
      });
      const candidateRoute = createMockCandidateRoute();
      const vehicle = createMockVehicle();

      const decision = evaluateRecoveryDecision({
        recoveryRequest,
        candidateRoutes: [candidateRoute],
        vehicle,
        thresholds: { maxDeltaDistanceKm: 1.0, maxDeltaDurationMins: 5 },
      });

      expect(decision.recommended_strategy).toBe("strategy_c_dedicated");
      expect(decision.selected_strategy).toBe("strategy_c_dedicated");
      // GB-003 Invariant: Strategy C must produce a concrete dedicated recovery task abstraction
      expect(decision.dedicated_task).toBeDefined();
      expect(decision.dedicated_task?.recovery_request_id).toBe(recoveryRequest.id);
      expect(decision.dedicated_task?.task_status).toBe("pending_dispatch");
    });
  });

  // =========================================================================
  // 3. Shipper Recovery Lifecycle Transitions
  // =========================================================================
  describe("3. Shipper Operational Recovery Actions", () => {
    it("should transition bag from return_requested -> recovering via startBagRecovery", () => {
      const bag = createMockBag({ status: "return_requested" });
      const shipperId = "shipper-user-888";

      const recoveringBag = startBagRecovery(bag, shipperId);

      expect(recoveringBag.status).toBe("recovering");
      expect(recoveringBag.current_holder_type).toBe("shipper");
      expect(recoveringBag.current_holder_user_id).toBe(shipperId);
      expect(recoveringBag.current_location_type).toBe("transit_vehicle");
      // Invariant: usage_count MUST NOT increment
      expect(recoveringBag.usage_count).toBe(3);
    });

    it("should transition bag from recovering -> at_hub via completeBagRecovery (verifying QR)", () => {
      const bag = createMockBag({
        status: "recovering",
        current_holder_type: "shipper",
        current_holder_user_id: "shipper-user-888",
        qr_code_hash: "hash-000001",
        bag_code: "BAG-000001",
      });
      const warehouseId = "warehouse-central-001";

      const { updatedBag, isIdempotentNoop } = completeBagRecovery({
        bag,
        scannedQrCode: "BAG-000001",
        targetWarehouseId: warehouseId,
        condition: "good",
      });

      expect(updatedBag.status).toBe("at_hub");
      expect(updatedBag.current_holder_type).toBe("warehouse");
      expect(updatedBag.current_warehouse_id).toBe(warehouseId);
      expect(updatedBag.current_holder_user_id).toBeNull();
      expect(isIdempotentNoop).toBe(false);
      // CRITICAL INVARIANT: verify_and_complete_bag_recovery MUST NOT increment usage_count!
      expect(updatedBag.usage_count).toBe(3);
    });
  });

  // =========================================================================
  // 4. Hub Post-Recovery Lifecycle & Usage Count Increment Invariant
  // =========================================================================
  describe("4. Hub Operations & Usage Count Increment Invariant", () => {
    it("should start inspection (at_hub -> inspection)", () => {
      const bag = createMockBag({
        status: "at_hub",
        current_warehouse_id: "warehouse-central-001",
      });

      const inspectingBag = startBagInspection(bag, "warehouse-central-001");
      expect(inspectingBag.status).toBe("inspection");
      expect(inspectingBag.usage_count).toBe(3);
    });

    it("CRITICAL: complete inspection washing with PASSED MUST increment usage_count by exactly 1 and transition to ready_for_reuse", () => {
      const bag = createMockBag({
        status: "inspection",
        current_warehouse_id: "warehouse-central-001",
        usage_count: 3,
      });

      const { updatedBag, cycleCompleted, usageIncremented } = completeBagInspectionWashing({
        bag,
        warehouseId: "warehouse-central-001",
        result: "passed",
        action: "washed_sanitized",
      });

      expect(updatedBag.status).toBe("ready_for_reuse");
      // Invariant: exactly 1 increment on passing inspection & washing
      expect(updatedBag.usage_count).toBe(4);
      expect(cycleCompleted).toBe(true);
      expect(usageIncremented).toBe(true);
    });

    it("complete inspection washing with FAILED / NEEDS_WASH must NOT increment usage_count and must transition to maintenance", () => {
      const bag = createMockBag({
        status: "inspection",
        current_warehouse_id: "warehouse-central-001",
        usage_count: 3,
      });

      const { updatedBag, cycleCompleted, usageIncremented } = completeBagInspectionWashing({
        bag,
        warehouseId: "warehouse-central-001",
        result: "needs_wash",
        action: "washed_sanitized",
      });

      expect(updatedBag.status).toBe("maintenance");
      // Invariant: usage_count MUST NOT increment when inspection fails / needs wash
      expect(updatedBag.usage_count).toBe(3);
      expect(cycleCompleted).toBe(false);
      expect(usageIncremented).toBe(false);
    });

    it("should return ready bag to stock (ready_for_reuse -> available)", () => {
      const bag = createMockBag({
        status: "ready_for_reuse",
        current_warehouse_id: "warehouse-central-001",
        usage_count: 4,
      });

      const availableBag = returnBagToStock(bag);
      expect(availableBag.status).toBe("available");
      expect(availableBag.usage_count).toBe(4);
    });
  });

  // =========================================================================
  // 5. Zero Scrap Kg Invariant
  // =========================================================================
  describe("5. Zero Scrap Kg Invariant", () => {
    it("should track PaaS reusable bags in discrete units without weight_kg dependency", () => {
      const bag = createMockBag({
        status: "with_customer",
        model_type: "standard_25l",
        size_category: "medium",
      });

      const { updatedBag } = requestBagRecovery(bag, false);

      // Verify that recovery request references bag identity, not scrap weight
      expect(updatedBag.id).toBe(bag.id);
      expect("weight_kg" in updatedBag).toBe(false);
      expect("actual_weight_kg" in updatedBag).toBe(false);
    });
  });
});
