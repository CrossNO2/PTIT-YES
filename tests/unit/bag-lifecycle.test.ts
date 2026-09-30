import { describe, it, expect } from "vitest";
import {
  PaasBag,
  OrderBagAssignment,
} from "@/types/database";
import {
  isValidBagTransition,
  assertValidBagTransition,
  InvalidTransitionError,
  BagAssignmentConflictError,
  assignBagToOrder,
  dispatchBagDelivery,
  completeBagDelivery,
  requestBagRecovery,
  startBagRecovery,
  completeBagRecovery,
  startBagInspection,
  sendBagToMaintenance,
  completeBagInspectionWashing,
  returnBagToStock,
  retireBag,
  resolveEventTypeForTransition,
} from "@/lib/lifecycle/bag-lifecycle-engine";

function createMockBag(overrides?: Partial<PaasBag>): PaasBag {
  return {
    id: "bag-uuid-001",
    bag_code: "BAG-000001",
    qr_code_hash: "hash-000001",
    owner_entity: "GREENBRIDGE_PLATFORM",
    is_platform_owned: true,
    current_shop_id: "shop-uuid-001",
    current_holder_type: "warehouse",
    current_holder_user_id: null,
    current_location_type: "warehouse",
    current_warehouse_id: "warehouse-uuid-001",
    current_pudo_id: null,
    model_type: "standard_25l",
    size_category: "medium",
    status: "available",
    condition: "new",
    usage_count: 0,
    max_cycles: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("PaaS Bag Lifecycle & Recovery Core Engine", () => {
  // ==========================================================================
  // Test A: Happy Path
  // 10 unique lifecycle states in a closed loop:
  // available → assigned → in_delivery → with_customer → return_requested
  // → recovering → at_hub → inspection → maintenance → ready_for_reuse (→ available)
  // ==========================================================================
  describe("A. Happy Path Circular Lifecycle", () => {
    it("should successfully execute full circular reuse cycle through 10 unique lifecycle states in a closed loop", () => {
      const initialBag = createMockBag({ status: "available", usage_count: 0 });
      const orderId = "order-uuid-101";
      const shopId = "shop-uuid-001";
      const warehouseId = "warehouse-uuid-001";
      const shipperId = "shipper-user-uuid-201";
      const customerId = "customer-user-uuid-301";
      const actorUserId = "staff-user-uuid-401";

      // 1. available → assigned
      const { updatedBag: bag1, assignment } = assignBagToOrder({
        bag: initialBag,
        orderId,
        shopId,
        actorUserId,
        activeAssignments: [],
      });
      expect(bag1.status).toBe("assigned");
      expect(bag1.current_holder_type).toBe("shop");
      expect(bag1.current_holder_user_id).toBe(actorUserId);
      expect(bag1.current_location_type).toBe("warehouse");
      expect(bag1.usage_count).toBe(0);
      expect(assignment.order_id).toBe(orderId);
      expect(assignment.bag_id).toBe(bag1.id);
      expect(assignment.is_active).toBe(true);
      expect(assignment.is_primary).toBe(true);

      // 2. assigned → in_delivery
      const bag2 = dispatchBagDelivery(bag1, shipperId);
      expect(bag2.status).toBe("in_delivery");
      expect(bag2.current_holder_type).toBe("shipper");
      expect(bag2.current_holder_user_id).toBe(shipperId);
      expect(bag2.current_location_type).toBe("transit_vehicle");
      expect(bag2.usage_count).toBe(0);

      // 3. in_delivery → with_customer
      const bag3 = completeBagDelivery(bag2, customerId);
      expect(bag3.status).toBe("with_customer");
      expect(bag3.current_holder_type).toBe("customer");
      expect(bag3.current_holder_user_id).toBe(customerId);
      expect(bag3.current_location_type).toBe("customer_address");
      expect(bag3.usage_count).toBe(0);

      // 4. with_customer → return_requested
      const { updatedBag: bag4, recoveryRequestId } = requestBagRecovery(bag3, false);
      expect(bag4.status).toBe("return_requested");
      expect(bag4.current_holder_type).toBe("customer");
      expect(bag4.current_location_type).toBe("customer_address");
      expect(bag4.usage_count).toBe(0);
      expect(recoveryRequestId).toBeDefined();

      // 5. return_requested → recovering
      const bag5 = startBagRecovery(bag4, shipperId);
      expect(bag5.status).toBe("recovering");
      expect(bag5.current_holder_type).toBe("shipper");
      expect(bag5.current_holder_user_id).toBe(shipperId);
      expect(bag5.current_location_type).toBe("transit_vehicle");
      expect(bag5.usage_count).toBe(0);

      // 6. recovering → at_hub
      const { updatedBag: bag6, depositRefundEligible, greenPointsAwardEligible } = completeBagRecovery({
        bag: bag5,
        scannedQrCode: bag5.qr_code_hash,
        targetWarehouseId: warehouseId,
        condition: "good",
      });
      expect(bag6.status).toBe("at_hub");
      expect(bag6.current_holder_type).toBe("warehouse");
      expect(bag6.current_holder_user_id).toBeNull();
      expect(bag6.current_location_type).toBe("warehouse");
      expect(bag6.current_warehouse_id).toBe(warehouseId);
      expect(bag6.usage_count).toBe(0); // STRICT INVARIANT: usage_count MUST NOT increment on pickup/at_hub!
      expect(depositRefundEligible).toBe(true);
      expect(greenPointsAwardEligible).toBe(true);

      // 7. at_hub → inspection
      const bag7 = startBagInspection(bag6, warehouseId);
      expect(bag7.status).toBe("inspection");
      expect(bag7.usage_count).toBe(0);

      // 8. inspection → maintenance
      const bag8 = sendBagToMaintenance(bag7, warehouseId);
      expect(bag8.status).toBe("maintenance");
      expect(bag8.current_location_type).toBe("cleaning_station");
      expect(bag8.usage_count).toBe(0);

      // 9. maintenance → ready_for_reuse (THE MOMENT OF REUSE ACCOUNTING)
      const { updatedBag: bag9, cycleCompleted, usageIncremented, newUsageCount } = completeBagInspectionWashing({
        bag: bag8,
        warehouseId,
        result: "passed",
        action: "washed_sanitized",
      });
      expect(bag9.status).toBe("ready_for_reuse");
      expect(bag9.current_holder_type).toBe("warehouse");
      expect(bag9.current_holder_user_id).toBeNull();
      expect(bag9.current_location_type).toBe("warehouse");
      expect(cycleCompleted).toBe(true);
      expect(usageIncremented).toBe(true);
      expect(newUsageCount).toBe(1);
      expect(bag9.usage_count).toBe(1); // Increment strictly here!

      // 10. ready_for_reuse → available
      const bag10 = returnBagToStock(bag9);
      expect(bag10.status).toBe("available");
      expect(bag10.usage_count).toBe(1);
      expect(bag10.current_holder_type).toBe("warehouse");
    });
  });

  // ==========================================================================
  // Test B: usage_count Invariants
  // ==========================================================================
  describe("B. usage_count Business Invariant", () => {
    it("should NOT increment usage_count on pickup, at_hub, inspection, failed inspection, or retired", () => {
      const bag = createMockBag({ usage_count: 5 });

      // In transit / recovering
      const recoveringBag = createMockBag({ status: "recovering", usage_count: 5 });
      const { updatedBag: atHubBag } = completeBagRecovery({
        bag: recoveringBag,
        scannedQrCode: recoveringBag.qr_code_hash,
        targetWarehouseId: "warehouse-uuid-001",
      });
      expect(atHubBag.usage_count).toBe(5);

      // Inspection start
      const inspectingBag = startBagInspection(atHubBag, "warehouse-uuid-001");
      expect(inspectingBag.usage_count).toBe(5);

      // Failed inspection / needs wash
      const { updatedBag: needsWashBag, cycleCompleted: washCycle, newUsageCount: washCount } = completeBagInspectionWashing({
        bag: inspectingBag,
        warehouseId: "warehouse-uuid-001",
        result: "needs_wash",
        action: "inspected_ok",
      });
      expect(needsWashBag.status).toBe("maintenance");
      expect(washCycle).toBe(false);
      expect(washCount).toBe(5);
      expect(needsWashBag.usage_count).toBe(5);

      // Degraded / damaged
      const inspectingBag2 = createMockBag({ status: "inspection", usage_count: 5 });
      const { updatedBag: degradedBag, cycleCompleted: degradedCycle, newUsageCount: degradedCount } = completeBagInspectionWashing({
        bag: inspectingBag2,
        warehouseId: "warehouse-uuid-001",
        result: "degraded",
        action: "inspected_ok",
      });
      expect(degradedBag.status).toBe("damaged");
      expect(degradedCycle).toBe(false);
      expect(degradedCount).toBe(5);
      expect(degradedBag.usage_count).toBe(5);

      // Scrapped / retired
      const inspectingBag3 = createMockBag({ status: "inspection", usage_count: 5 });
      const { updatedBag: scrappedBag, cycleCompleted: scrappedCycle, newUsageCount: scrappedCount } = completeBagInspectionWashing({
        bag: inspectingBag3,
        warehouseId: "warehouse-uuid-001",
        result: "scrapped",
        action: "scrapped",
      });
      expect(scrappedBag.status).toBe("retired");
      expect(scrappedCycle).toBe(false);
      expect(scrappedCount).toBe(5);
      expect(scrappedBag.usage_count).toBe(5);

      // Direct retirement
      const retiredBag = retireBag(bag, "Wear and tear");
      expect(retiredBag.status).toBe("retired");
      expect(retiredBag.usage_count).toBe(5);
    });

    it("should increment usage_count by exactly +1 ONLY when inspection passes and status transitions to ready_for_reuse", () => {
      const inspectingBag = createMockBag({ status: "inspection", usage_count: 3 });
      const { updatedBag, cycleCompleted, usageIncremented, newUsageCount } = completeBagInspectionWashing({
        bag: inspectingBag,
        warehouseId: "warehouse-uuid-001",
        result: "passed",
        action: "washed_sanitized",
      });

      expect(updatedBag.status).toBe("ready_for_reuse");
      expect(cycleCompleted).toBe(true);
      expect(usageIncremented).toBe(true);
      expect(newUsageCount).toBe(4);
      expect(updatedBag.usage_count).toBe(4);
    });
  });

  // ==========================================================================
  // Test C: Invalid Transitions
  // ==========================================================================
  describe("C. Invalid Transitions Rejection", () => {
    it("should reject 'available' → 'at_hub'", () => {
      expect(isValidBagTransition("available", "at_hub")).toBe(false);
      expect(() => assertValidBagTransition("available", "at_hub")).toThrow(InvalidTransitionError);
    });

    it("should reject 'with_customer' → 'ready_for_reuse'", () => {
      expect(isValidBagTransition("with_customer", "ready_for_reuse")).toBe(false);
      expect(() => assertValidBagTransition("with_customer", "ready_for_reuse")).toThrow(InvalidTransitionError);
    });

    it("should reject 'retired' → 'available'", () => {
      expect(isValidBagTransition("retired", "available")).toBe(false);
      expect(() => assertValidBagTransition("retired", "available")).toThrow(InvalidTransitionError);
    });

    it("should reject any outgoing transition from 'retired'", () => {
      const allStatuses: PaasBag["status"][] = [
        "available", "assigned", "in_delivery", "with_customer",
        "return_requested", "recovering", "at_hub", "inspection",
        "maintenance", "ready_for_reuse", "damaged"
      ];

      for (const target of allStatuses) {
        expect(isValidBagTransition("retired", target)).toBe(false);
        expect(() => assertValidBagTransition("retired", target)).toThrow(InvalidTransitionError);
      }
    });

    it("should reject skipping delivery: 'assigned' → 'with_customer'", () => {
      expect(isValidBagTransition("assigned", "with_customer")).toBe(false);
      expect(() => assertValidBagTransition("assigned", "with_customer")).toThrow(InvalidTransitionError);
    });
  });

  // ==========================================================================
  // Test D: Idempotency
  // ==========================================================================
  describe("D. Idempotency Guarantees", () => {
    it("should NOT double-increment usage_count when completeBagInspectionWashing is called twice for the same cycle", () => {
      const maintenanceBag = createMockBag({ status: "maintenance", usage_count: 7 });

      // First call: passes and moves to ready_for_reuse
      const res1 = completeBagInspectionWashing({
        bag: maintenanceBag,
        warehouseId: "warehouse-uuid-001",
        result: "passed",
        action: "washed_sanitized",
      });
      expect(res1.updatedBag.status).toBe("ready_for_reuse");
      expect(res1.newUsageCount).toBe(8);
      expect(res1.usageIncremented).toBe(true);

      // Second call on already ready_for_reuse bag: MUST NOT increment to 9!
      const res2 = completeBagInspectionWashing({
        bag: res1.updatedBag,
        warehouseId: "warehouse-uuid-001",
        result: "passed",
        action: "washed_sanitized",
      });
      expect(res2.updatedBag.status).toBe("ready_for_reuse");
      expect(res2.newUsageCount).toBe(8); // STRICT: Still 8, NOT 9!
      expect(res2.usageIncremented).toBe(false);
      expect(res2.cycleCompleted).toBe(false);
    });

    it("should return idempotent no-op when recovery completion is invoked for already returned bag", () => {
      const atHubBag = createMockBag({ status: "at_hub", usage_count: 2 });

      const res = completeBagRecovery({
        bag: atHubBag,
        scannedQrCode: atHubBag.qr_code_hash,
        targetWarehouseId: "warehouse-uuid-001",
        isAlreadyCompleted: true,
      });

      expect(res.isIdempotentNoop).toBe(true);
      expect(res.depositRefundEligible).toBe(false);
      expect(res.greenPointsAwardEligible).toBe(false);
      expect(res.updatedBag.usage_count).toBe(2);
    });
  });

  // ==========================================================================
  // Test E: Assignment Exclusivity
  // ==========================================================================
  describe("E. Order ↔ Bag Assignment Cardinality & Exclusivity", () => {
    it("should prevent an actively assigned bag from being assigned to another order", () => {
      const bag = createMockBag({ status: "available" });
      const existingActiveAssignments: OrderBagAssignment[] = [
        {
          id: "assign-uuid-1",
          order_id: "order-uuid-old",
          bag_id: bag.id,
          assigned_at: new Date().toISOString(),
          is_primary: true,
          is_active: true,
        },
      ];

      expect(() => {
        assignBagToOrder({
          bag,
          orderId: "order-uuid-new",
          shopId: "shop-uuid-001",
          actorUserId: "user-uuid-1",
          activeAssignments: existingActiveAssignments,
        });
      }).toThrow(BagAssignmentConflictError);
    });

    it("should prevent an order from having multiple primary active bags", () => {
      const bag = createMockBag({ id: "bag-uuid-2", bag_code: "BAG-000002", status: "available" });
      const targetOrderId = "order-uuid-target";

      const existingActiveAssignments: OrderBagAssignment[] = [
        {
          id: "assign-uuid-1",
          order_id: targetOrderId,
          bag_id: "bag-uuid-1",
          assigned_at: new Date().toISOString(),
          is_primary: true,
          is_active: true,
        },
      ];

      expect(() => {
        assignBagToOrder({
          bag,
          orderId: targetOrderId,
          shopId: "shop-uuid-001",
          actorUserId: "user-uuid-1",
          activeAssignments: existingActiveAssignments,
        });
      }).toThrow(BagAssignmentConflictError);
    });

    it("should allow re-assigning a bag once its previous assignment is no longer active (is_active = false)", () => {
      const bag = createMockBag({ status: "available" });
      const pastInactiveAssignments: OrderBagAssignment[] = [
        {
          id: "assign-uuid-1",
          order_id: "order-uuid-past",
          bag_id: bag.id,
          assigned_at: new Date(Date.now() - 86400000).toISOString(),
          is_primary: true,
          is_active: false, // Closed previous cycle!
        },
      ];

      const { updatedBag, assignment } = assignBagToOrder({
        bag,
        orderId: "order-uuid-new",
        shopId: "shop-uuid-001",
        actorUserId: "user-uuid-1",
        activeAssignments: pastInactiveAssignments,
      });

      expect(updatedBag.status).toBe("assigned");
      expect(assignment.order_id).toBe("order-uuid-new");
      expect(assignment.is_active).toBe(true);
    });
  });

  // ==========================================================================
  // Test F: GB-002 Blocker Fixes Verification (Audit Remediation)
  // ==========================================================================
  describe("F. GB-002 Blocker Fixes Verification", () => {
    // A. Direct paas_bags mutation is blocked/restricted
    it("should prevent direct illegal status jumps outside of authorized lifecycle operations", () => {
      const bag = createMockBag({ status: "available", usage_count: 0 });
      expect(() => assertValidBagTransition(bag.status, "at_hub")).toThrow(InvalidTransitionError);
      expect(() => assertValidBagTransition("with_customer", "ready_for_reuse")).toThrow(InvalidTransitionError);
      expect(() => assertValidBagTransition("retired", "available")).toThrow(InvalidTransitionError);
    });

    // B. Recovery completion does not produce NULL warehouse_id
    it("should set a valid non-null warehouse_id upon recovery completion", () => {
      const recoveringBag = createMockBag({ status: "recovering", usage_count: 2 });
      const validWarehouseId = "warehouse-uuid-hub-01";
      const { updatedBag } = completeBagRecovery({
        bag: recoveringBag,
        scannedQrCode: recoveringBag.qr_code_hash,
        targetWarehouseId: validWarehouseId,
      });

      expect(updatedBag.status).toBe("at_hub");
      expect(updatedBag.current_warehouse_id).toBe(validWarehouseId);
      expect(updatedBag.current_warehouse_id).not.toBeNull();
      expect(updatedBag.current_location_type).toBe("warehouse");
    });

    // C. Recovery completion fails clearly if no valid warehouse exists
    it("should throw NO_VALID_WAREHOUSE_FOUND if targetWarehouseId is empty or missing", () => {
      const recoveringBag = createMockBag({ status: "recovering", usage_count: 2 });

      expect(() => {
        completeBagRecovery({
          bag: recoveringBag,
          scannedQrCode: recoveringBag.qr_code_hash,
          targetWarehouseId: "", // Empty/unresolved
        });
      }).toThrow(/NO_VALID_WAREHOUSE_FOUND/);
    });

    // D. ready_for_reuse → available creates the correct lifecycle event
    it("should map ready_for_reuse → available specifically to RETURNED_TO_STOCK, and transitions into ready_for_reuse to non-RETURNED_TO_STOCK", () => {
      // ready_for_reuse -> available is specifically RETURNED_TO_STOCK
      expect(resolveEventTypeForTransition("available", undefined, "ready_for_reuse")).toBe("RETURNED_TO_STOCK");

      // inspection -> ready_for_reuse is NOT RETURNED_TO_STOCK (it is INSPECTED)
      const inspectionEvent = resolveEventTypeForTransition("ready_for_reuse", undefined, "inspection");
      expect(inspectionEvent).not.toBe("RETURNED_TO_STOCK");
      expect(inspectionEvent).toBe("INSPECTED");

      // maintenance -> ready_for_reuse is NOT RETURNED_TO_STOCK (it is CLEANED_SANITIZED)
      const maintenanceEvent = resolveEventTypeForTransition("ready_for_reuse", "washed_sanitized", "maintenance");
      expect(maintenanceEvent).not.toBe("RETURNED_TO_STOCK");
      expect(maintenanceEvent).toBe("CLEANED_SANITIZED");
    });
  });
});
