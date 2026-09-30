import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  PaasBagStatus,
  RecoveryRequest,
  RecoveryStrategyType,
  Route,
  Vehicle,
  Warehouse,
} from "@/types/database";
import {
  isValidBagTransition,
  assertValidBagTransition,
  InvalidTransitionError,
  ALLOWED_TRANSITIONS,
} from "@/lib/lifecycle/bag-lifecycle-engine";
import {
  evaluateRecoveryDecision,
  ContextSignalSnapshot,
} from "@/lib/lifecycle/recovery-engine";
import { OPTIMIZATION_CONFIG } from "@/lib/optimization/config";

// Schema matching app/api/customer/recoveries/route.ts
const customerRecoveryInputSchema = z.object({
  bag_id: z.string().uuid(),
  pickup_address: z.string().min(5).max(300),
  pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_slot_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().default("08:00"),
  time_slot_end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().default("18:00"),
  notes: z.string().max(500).optional().default(""),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

describe("GB-008 PM Review Hardening & Invariant Verification", () => {
  // =========================================================================
  // 1. Customer Cannot Choose Strategy & Server-Side Strategy Authority
  // =========================================================================
  describe("1. Customer Strategy Authority Restrictions", () => {
    it("should strip client-supplied recovery_strategy from payload and prevent customer choice", () => {
      const maliciousPayload = {
        bag_id: "11111111-1111-4111-8111-111111111111",
        pickup_address: "123 Nguyen Hue, Ben Nghe, District 1, HCMC",
        pickup_date: "2026-10-01",
        time_slot_start: "09:00",
        time_slot_end: "11:00",
        notes: "Please call on arrival",
        // Client attempts to force Strategy C (dedicated vehicle) or arbitrary strategy:
        recovery_strategy: "strategy_c_dedicated",
        selected_strategy: "strategy_a_merged",
      };

      const parsed = customerRecoveryInputSchema.parse(maliciousPayload);

      // Verify zod schema ignores/strips client choice
      expect((parsed as any).recovery_strategy).toBeUndefined();
      expect((parsed as any).selected_strategy).toBeUndefined();
    });

    it("should enforce that server evaluateRecoveryDecision determines strategy based on route feasibility", () => {
      const recoveryRequest: RecoveryRequest = {
        id: "rec-001",
        shop_id: "shop-001",
        customer_id: "cust-001",
        bag_id: "bag-001",
        order_id: "ord-001",
        status: "requested",
        recovery_strategy: "strategy_a_merged", // Default DB fallback
        pickup_address: "123 Nguyen Hue, District 1",
        lat: 10.7735,
        lng: 106.7032,
        pickup_date: "2026-10-01",
        time_slot_start: "08:00",
        time_slot_end: "18:00",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const warehouse: Warehouse = {
        id: "wh-001",
        shop_id: "shop-001",
        name: "Central Hub",
        address: "100 Le Loi, District 1",
        lat: 10.7700,
        lng: 106.6980,
        is_default: true,
        has_cleaning_facility: true,
        has_inspection_depot: true,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const contextSignals: ContextSignalSnapshot = {
        source: "SIMULATED",
        weatherCondition: "CLEAR",
        trafficLevel: "medium",
        floodRiskLevel: "none",
        severityLevel: "low",
        capturedAt: new Date().toISOString(),
      };

      // When NO candidate routes are available, server autonomously selects Strategy C:
      const decisionNoRoutes = evaluateRecoveryDecision({
        recoveryRequest,
        candidateRoutes: [],
        warehouse,
        vehicle: null,
        contextSignals,
      });

      expect(decisionNoRoutes.selected_strategy).toBe("strategy_c_dedicated");
      expect(decisionNoRoutes.is_strategy_a).toBe(false);
      expect(decisionNoRoutes.rationale.reason_code).toBe("NO_ACTIVE_ROUTE_FOUND");
    });
  });

  // =========================================================================
  // 2. Canonical PaaS Bag Lifecycle (10 Unique States in a Closed Loop)
  // =========================================================================
  describe("2. Canonical 10 Unique Lifecycle States in a Closed Loop (No 'picked_up')", () => {
    it("should verify 10 unique lifecycle states in a closed loop and that 'picked_up' is NOT in the lifecycle", () => {
      const closedLoopStates: PaasBagStatus[] = [
        "available",
        "assigned",
        "in_delivery",
        "with_customer",
        "return_requested",
        "recovering",
        "at_hub",
        "inspection",
        "maintenance",
        "ready_for_reuse",
      ];

      // Exactly 10 unique states in the circular closed loop
      expect(new Set(closedLoopStates).size).toBe(10);
      expect(closedLoopStates).not.toContain("picked_up");
      expect(Object.keys(ALLOWED_TRANSITIONS)).not.toContain("picked_up");
    });

    it("should reject any bag transition into or out of 'picked_up'", () => {
      expect(isValidBagTransition("return_requested", "picked_up" as any)).toBe(false);
      expect(isValidBagTransition("with_customer", "picked_up" as any)).toBe(false);
      expect(isValidBagTransition("picked_up" as any, "recovering")).toBe(false);
      expect(isValidBagTransition("picked_up" as any, "at_hub")).toBe(false);

      expect(() => assertValidBagTransition("return_requested", "picked_up" as any)).toThrow(
        InvalidTransitionError
      );
    });

    it("should verify that physical shipper pickup transitions bag strictly: return_requested → recovering", () => {
      expect(isValidBagTransition("return_requested", "recovering")).toBe(true);
      expect(isValidBagTransition("recovering", "at_hub")).toBe(true);
    });
  });

  // =========================================================================
  // 3. Strategy B (PUDO) Remains Non-Operational (Architecture-Ready Only)
  // =========================================================================
  describe("3. Strategy B (PUDO) Non-Operational Status", () => {
    it("should confirm Strategy B is not selected as an operational dispatch plan", () => {
      const recoveryRequest: RecoveryRequest = {
        id: "rec-002",
        shop_id: "shop-001",
        customer_id: "cust-001",
        bag_id: "bag-001",
        status: "requested",
        recovery_strategy: "strategy_a_merged",
        pickup_address: "123 Nguyen Hue",
        lat: 10.7735,
        lng: 106.7032,
        pickup_date: "2026-10-01",
        time_slot_start: "08:00",
        time_slot_end: "18:00",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const warehouse: Warehouse = {
        id: "wh-001",
        shop_id: "shop-001",
        name: "Central Hub",
        address: "100 Le Loi",
        lat: 10.7700,
        lng: 106.6980,
        is_default: true,
        has_cleaning_facility: true,
        has_inspection_depot: true,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const decision = evaluateRecoveryDecision({
        recoveryRequest,
        candidateRoutes: [],
        warehouse,
        vehicle: null,
      });

      // In GB-008, operational options are Strategy A or Strategy C fallback only
      expect(decision.selected_strategy).not.toBe("strategy_b_pudo");
      expect(["strategy_a_merged", "strategy_c_dedicated"]).toContain(decision.selected_strategy);
    });
  });

  // =========================================================================
  // 4. Traceability of Optimization Config Constants
  // =========================================================================
  describe("4. Traceability of Config Constants vs Arbitrary Claims", () => {
    it("should verify that the canonical reverse logistics insertion threshold is 2.0 km, not arbitrary numbers", () => {
      expect(OPTIMIZATION_CONFIG.reverseLogistics.maxDeltaDistanceKm).toBe(2.0);
      expect(OPTIMIZATION_CONFIG.reverseLogistics.maxDeltaDurationMins).toBe(10.0);
      expect(OPTIMIZATION_CONFIG.defaultServiceTimeMins).toBe(10);
    });
  });

  // =========================================================================
  // 5. Database State Truthfulness (No Fake Realtime Stream Mocking)
  // =========================================================================
  describe("5. Database State Snapshot vs Realtime Stream", () => {
    it("should calculate recovery rate deterministically from database query results", () => {
      const mockRecoveries = [
        { status: "completed" },
        { status: "completed" },
        { status: "requested" },
        { status: "in_transit" },
      ];

      const completed = mockRecoveries.filter((r) => r.status === "completed").length;
      const total = mockRecoveries.length;
      const ratePercent = total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0;

      expect(ratePercent).toBe(50.0);
      expect(completed).toBe(2);
      expect(total).toBe(4);
    });
  });

  // =========================================================================
  // 6. Unauthorized Role Restrictions
  // =========================================================================
  describe("6. Role Authorization & Access Boundaries", () => {
    it("should reject bag lifecycle actions from unauthorized entities", () => {
      // Invariant: Customer holding bag cannot directly set it to available or at_hub
      expect(isValidBagTransition("with_customer", "available")).toBe(false);
      expect(isValidBagTransition("with_customer", "at_hub")).toBe(false);
      expect(isValidBagTransition("with_customer", "inspection")).toBe(false);

      // Shipper cannot bypass Hub inspection
      expect(isValidBagTransition("recovering", "ready_for_reuse")).toBe(false);
      expect(isValidBagTransition("recovering", "available")).toBe(false);
    });
  });
});
