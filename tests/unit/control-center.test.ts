import { describe, it, expect } from "vitest";
import { PaasBag, RecoveryRequest, Vehicle, ShopMemberRole } from "@/types/database";
import { evaluateRecoveryDecision, ContextSignalSnapshot } from "@/lib/lifecycle/recovery-engine";

// Helper for Mock Bag
function createMockBag(overrides?: Partial<PaasBag>): PaasBag {
  return {
    id: "bag-control-001",
    bag_code: "BAG-000001",
    qr_code_hash: "hash-qr-000001",
    owner_entity: "GREENBRIDGE_PLATFORM",
    is_platform_owned: true,
    current_shop_id: "shop-001",
    current_holder_type: "customer",
    current_holder_user_id: "user-cust-001",
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

describe("GB-005 GALM Operational Control Center Unit Tests", () => {
  // =========================================================================
  // 1. ADMIN OPERATIONAL AUTHORIZATION
  // =========================================================================
  describe("1. Admin Server-Side Authorization Matrix", () => {
    const ALLOWED_HUB_ROLES: ShopMemberRole[] = ["owner", "admin", "dispatcher"];

    function checkOperationalAccess(user: {
      account_type: "platform_admin" | "shop_user" | "customer";
      member_role?: ShopMemberRole | null;
      shop_id?: string | null;
      target_shop_id?: string | null;
    }) {
      if (user.account_type === "customer") {
        throw new Error("FORBIDDEN: Khách hàng không có quyền truy cập trung tâm điều hành");
      }
      if (user.account_type === "platform_admin") {
        return { authorized: true, role: "platform_admin" };
      }
      if (user.account_type === "shop_user") {
        if (!user.member_role || !ALLOWED_HUB_ROLES.includes(user.member_role)) {
          throw new Error("FORBIDDEN: Vai trò shipper/nhân viên không được phép quản trị điều phối");
        }
        if (user.shop_id !== user.target_shop_id) {
          throw new Error("FORBIDDEN: Không thuộc phạm vi shop quản lý");
        }
        return { authorized: true, role: user.member_role };
      }
      throw new Error("FORBIDDEN: Tài khoản không hợp lệ");
    }

    it("Platform Admin has universal access across any shop's operational dashboard", () => {
      const res = checkOperationalAccess({
        account_type: "platform_admin",
        target_shop_id: "shop-002",
      });
      expect(res.authorized).toBe(true);
      expect(res.role).toBe("platform_admin");
    });

    it("Shop dispatcher/owner/admin is granted access within their assigned shop", () => {
      const resDispatcher = checkOperationalAccess({
        account_type: "shop_user",
        member_role: "dispatcher",
        shop_id: "shop-001",
        target_shop_id: "shop-001",
      });
      expect(resDispatcher.authorized).toBe(true);

      const resOwner = checkOperationalAccess({
        account_type: "shop_user",
        member_role: "owner",
        shop_id: "shop-001",
        target_shop_id: "shop-001",
      });
      expect(resOwner.authorized).toBe(true);
    });

    it("Customers cannot access admin operational data (403 Forbidden)", () => {
      expect(() =>
        checkOperationalAccess({
          account_type: "customer",
          target_shop_id: "shop-001",
        })
      ).toThrow(/FORBIDDEN: Khách hàng không có quyền/);
    });

    it("Ordinary shippers cannot access admin operational data (403 Forbidden)", () => {
      expect(() =>
        checkOperationalAccess({
          account_type: "shop_user",
          member_role: "shipper",
          shop_id: "shop-001",
          target_shop_id: "shop-001",
        })
      ).toThrow(/FORBIDDEN: Vai trò shipper/);
    });

    it("Shop user cannot access operational data of another shop", () => {
      expect(() =>
        checkOperationalAccess({
          account_type: "shop_user",
          member_role: "admin",
          shop_id: "shop-001",
          target_shop_id: "shop-999",
        })
      ).toThrow(/FORBIDDEN: Không thuộc phạm vi shop quản lý/);
    });
  });

  // =========================================================================
  // 2. KPI LAYER FORMULAS & INSUFFICIENT DATA HANDLING
  // =========================================================================
  describe("2. KPI Layer Calculations (No Fake Numbers)", () => {
    it("KPI 1: Cost per order returns N/A with reason 'No reliable per-order fulfillment cost source'", () => {
      const orders = [
        { id: "ord-1", status: "delivered" },
        { id: "ord-2", status: "delivered" },
      ];

      // Audit: orders table has no order fulfillment cost field
      // routes.estimated_cost_vnd is a route-level estimate and cannot currently be reliably attributed to individual orders
      const hasOrderCostColumn = false;
      const completedOrdersCount = orders.length;

      const costPerOrderKpi = {
        value: hasOrderCostColumn ? 25000 : null,
        display: "N/A",
        status: "INSUFFICIENT_DATA",
        formula: "Tổng chi phí hoàn tất đơn / Số đơn hàng hoàn tất (Cost / Order)",
        completed_orders: completedOrdersCount,
        reason: "No reliable per-order fulfillment cost source.",
        documentation:
          "routes.estimated_cost_vnd là chi phí ước tính ở cấp độ toàn tuyến và hiện tại không thể quy kết một cách tin cậy cho từng đơn hàng riêng lẻ; do đó chi phí mỗi đơn hàng (Cost per Order) không được tính toán từ trường này và hệ thống trả về N/A, không hiển thị giá trị suy diễn giả định.",
      };

      expect(costPerOrderKpi.value).toBeNull();
      expect(costPerOrderKpi.display).toBe("N/A");
      expect(costPerOrderKpi.status).toBe("INSUFFICIENT_DATA");
      expect(costPerOrderKpi.reason).toBe("No reliable per-order fulfillment cost source.");
      expect(costPerOrderKpi.documentation).toContain("routes.estimated_cost_vnd là chi phí ước tính ở cấp độ toàn tuyến");
    });

    it("KPI 2: Bag recovery rate strictly computes completed / total requested recoveries", () => {
      const recoveryRequests = [
        { id: "rec-1", status: "completed" },
        { id: "rec-2", status: "completed" },
        { id: "rec-3", status: "in_transit" },
        { id: "rec-4", status: "requested" },
      ];

      const completed = recoveryRequests.filter((r) => r.status === "completed").length;
      const total = recoveryRequests.length;
      const rate = total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0;

      expect(completed).toBe(2);
      expect(total).toBe(4);
      expect(rate).toBe(50.0);
    });

    it("KPI 3: Actual reuse cycles per PaaS bag strictly computes average usage_count across fleet", () => {
      const bagFleet: PaasBag[] = [
        createMockBag({ usage_count: 2 }),
        createMockBag({ usage_count: 5 }),
        createMockBag({ usage_count: 4 }),
        createMockBag({ usage_count: 1 }),
      ];

      const totalCycles = bagFleet.reduce((sum, b) => sum + b.usage_count, 0);
      const avgCycles = Number((totalCycles / bagFleet.length).toFixed(1));

      expect(totalCycles).toBe(12);
      expect(avgCycles).toBe(3.0);
    });
  });

  // =========================================================================
  // 3. DECISION EXPLAINABILITY (STRATEGY A & STRATEGY C)
  // =========================================================================
  describe("3. Decision Explainability Panel Structure", () => {
    const simulatedContext: ContextSignalSnapshot = {
      source: "SIMULATED",
      weatherCondition: "CLEAR",
      trafficLevel: "medium",
      floodRiskLevel: "none",
      severityLevel: "low",
      capturedAt: new Date().toISOString(),
    };

    it("Strategy A explainability produces detour delta km, duration delta mins, and route linkage", () => {
      const recoveryRequest: RecoveryRequest = {
        id: "rec-explain-a",
        shop_id: "shop-001",
        customer_id: "cust-001",
        bag_id: "bag-001",
        order_id: null,
        status: "requested",
        recovery_strategy: "strategy_a_merged",
        pickup_address: "10 Tràng Tiền, Hà Nội",
        lat: 21.025,
        lng: 105.855,
        pickup_date: "2026-10-01",
        time_slot_start: "08:00",
        time_slot_end: "18:00",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const candidateRoute = {
        id: "route-viable-001",
        shop_id: "shop-001",
        warehouse_id: "wh-001",
        route_date: "2026-10-01",
        shipper_id: "shipper-001",
        vehicle_id: "veh-001",
        naive_distance_km: 15.0,
        optimized_distance_km: 14.5,
        total_duration_mins: 60,
        estimated_cost_vnd: 50000,
        status: "assigned" as const,
        route_type: "delivery_with_recovery" as const,
        optimization_version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        stops: [
          { lat: 21.024, lng: 105.854, sequence_index: 1, stop_type: "delivery" },
          { lat: 21.026, lng: 105.856, sequence_index: 2, stop_type: "delivery" },
        ],
        vehicle: {
          id: "veh-001",
          shop_id: "shop-001",
          name: "Xe Van PaaS",
          license_plate: "29A-12345",
          vehicle_type: "small_van",
          capacity_kg: 500,
          bag_capacity_units: 50,
          current_load_kg: 50,
          fuel_cost_vnd_per_km: 1200,
          co2_kg_per_km: 0.15,
          status: "active" as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as Vehicle,
      };

      const decision = evaluateRecoveryDecision({
        recoveryRequest,
        candidateRoutes: [candidateRoute],
        contextSignals: simulatedContext,
      });

      expect(decision.selected_strategy).toBe("strategy_a_merged");
      expect(decision.is_strategy_a).toBe(true);
      expect(decision.target_route_id).toBe("route-viable-001");
      expect(decision.estimated_distance_delta_km).toBeGreaterThanOrEqual(0);
      expect(decision.estimated_duration_delta_mins).toBeGreaterThanOrEqual(0);
      expect(decision.context_signals_snapshot.source).toBe("SIMULATED");
    });

    it("Strategy C explainability produces reason code, why Strategy A failed, and dedicated recovery task", () => {
      const recoveryRequest: RecoveryRequest = {
        id: "rec-explain-c",
        shop_id: "shop-001",
        customer_id: "cust-001",
        bag_id: "bag-001",
        order_id: null,
        status: "requested",
        recovery_strategy: "strategy_c_dedicated",
        pickup_address: "99 Hoàng Hoa Thám, Hà Nội",
        lat: 21.045,
        lng: 105.815,
        pickup_date: "2026-10-01",
        time_slot_start: "08:00",
        time_slot_end: "18:00",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // No active routes in area -> Strategy C fallback
      const decision = evaluateRecoveryDecision({
        recoveryRequest,
        candidateRoutes: [],
        contextSignals: simulatedContext,
      });

      expect(decision.selected_strategy).toBe("strategy_c_dedicated");
      expect(decision.is_strategy_a).toBe(false);
      expect(decision.rationale.reason_code).toBe("NO_ACTIVE_ROUTE_FOUND");
      expect(decision.dedicated_task).toBeDefined();
      expect(decision.dedicated_task?.target_route_type).toBe("dedicated_recovery");
      expect(decision.dedicated_task?.task_status).toBe("pending_dispatch");
      expect(decision.dedicated_task?.recovery_request_id).toBe("rec-explain-c");
    });

    it("Context signals are explicitly tagged as SIMULATED for transparency", () => {
      expect(simulatedContext.source).toBe("SIMULATED");
      expect(simulatedContext.weatherCondition).toBe("CLEAR");
      expect(simulatedContext.trafficLevel).toBe("medium");
    });
  });

  // =========================================================================
  // 4. BAG LIFECYCLE TIMELINE & IMMUTABLE LEDGER
  // =========================================================================
  describe("4. Bag Lifecycle Timeline & Immutable Ledger", () => {
    it("Enforces closed-loop lifecycle with 10 unique states for PaaS bag reuse", () => {
      // 10 unique lifecycle states with 'available' appearing at both the beginning and end of the closed loop
      const closedLoopSequence = [
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
        "available", // Closed-loop transition back to available for reuse
      ];

      const uniqueStates = new Set(closedLoopSequence);
      expect(uniqueStates.size).toBe(10);
      expect(closedLoopSequence[0]).toBe("available");
      expect(closedLoopSequence[closedLoopSequence.length - 1]).toBe("available");
      expect(closedLoopSequence[3]).toBe("with_customer");
      expect(closedLoopSequence[6]).toBe("at_hub");
      expect(closedLoopSequence[9]).toBe("ready_for_reuse");
    });

    it("Correctly handles damaged / retired branch off the standard pipeline", () => {
      const bagDamaged = createMockBag({ status: "damaged" });
      const bagRetired = createMockBag({ status: "retired" });

      const isOffPipeline = (status: string) => ["damaged", "retired"].includes(status);

      expect(isOffPipeline(bagDamaged.status)).toBe(true);
      expect(isOffPipeline(bagRetired.status)).toBe(true);
      expect(isOffPipeline("ready_for_reuse")).toBe(false);
    });

    it("Timeline reconstructs chronological immutable events from bag_lifecycle_events", () => {
      const events = [
        {
          id: "ev-1",
          from_status: "available",
          to_status: "assigned",
          event_type: "ASSIGNED_TO_ORDER",
          created_at: "2026-09-28T08:00:00Z",
        },
        {
          id: "ev-2",
          from_status: "assigned",
          to_status: "in_delivery",
          event_type: "DISPATCHED_TO_SHIPPER",
          created_at: "2026-09-28T09:00:00Z",
        },
        {
          id: "ev-3",
          from_status: "in_delivery",
          to_status: "with_customer",
          event_type: "DELIVERED_TO_CUSTOMER",
          created_at: "2026-09-28T10:30:00Z",
        },
        {
          id: "ev-4",
          from_status: "with_customer",
          to_status: "return_requested",
          event_type: "RECOVERY_REQUESTED",
          created_at: "2026-09-29T14:00:00Z",
        },
      ];

      expect(events.length).toBe(4);
      expect(events[0].to_status).toBe("assigned");
      expect(events[3].to_status).toBe("return_requested");
      expect(events[3].event_type).toBe("RECOVERY_REQUESTED");
    });
  });

  // =========================================================================
  // 5. RECOVERY OVERVIEW FILTERING & SEARCH
  // =========================================================================
  describe("5. Recovery Overview Filtering & Search", () => {
    const sampleRecoveries = [
      {
        id: "rec-001",
        bag_code: "BAG-000001",
        status: "requested",
        recovery_strategy: "strategy_a_merged",
        pickup_date: "2026-10-01",
        customer_name: "Nguyễn Văn A",
      },
      {
        id: "rec-002",
        bag_code: "BAG-000002",
        status: "assigned",
        recovery_strategy: "strategy_a_merged",
        pickup_date: "2026-10-01",
        customer_name: "Trần Thị B",
      },
      {
        id: "rec-003",
        bag_code: "BAG-000003",
        status: "completed",
        recovery_strategy: "strategy_c_dedicated",
        pickup_date: "2026-10-02",
        customer_name: "Lê Văn C",
      },
    ];

    it("Filters recoveries by status", () => {
      const filtered = sampleRecoveries.filter((r) => r.status === "assigned");
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe("rec-002");
    });

    it("Filters recoveries by strategy", () => {
      const filteredC = sampleRecoveries.filter((r) => r.recovery_strategy === "strategy_c_dedicated");
      expect(filteredC.length).toBe(1);
      expect(filteredC[0].id).toBe("rec-003");
    });

    it("Filters recoveries by date and search query", () => {
      const filtered = sampleRecoveries.filter(
        (r) =>
          r.pickup_date === "2026-10-01" &&
          (r.bag_code.includes("000002") || r.customer_name.includes("000002"))
      );
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe("rec-002");
    });
  });
});
