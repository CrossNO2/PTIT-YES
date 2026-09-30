import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireShopMembership } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const shopId = new URL(request.url).searchParams.get("shop_id");
    if (!shopId) return jsonError("shop_id parameter is required", "MISSING_SHOP_ID", 400);

    // 1. Server-side authorization: only shop operators (owner, admin, dispatcher)
    await requireShopMembership(shopId, ["owner", "admin", "dispatcher"]);
    const supabase = await createClient();

    // 2. Parallel queries for PaaS fleet, recoveries, routes, vehicles, shippers, context signals
    const [
      bagsRes,
      recoveriesRes,
      routesRes,
      vehiclesRes,
      shippersRes,
      contextRes,
      ordersRes,
    ] = await Promise.all([
      // PaaS Bags allocated to this shop
      supabase
        .from("paas_bags")
        .select("id, bag_code, status, condition, usage_count, max_cycles, current_warehouse_id, current_holder_type")
        .eq("current_shop_id", shopId),

      // Recovery Requests
      supabase
        .from("recovery_requests")
        .select(`
          id,
          status,
          recovery_strategy,
          bag_id,
          pickup_date,
          pickup_address,
          lat,
          lng,
          created_at,
          paas_bags (bag_code, model_type, usage_count),
          recovery_decisions (
            id,
            recommended_strategy,
            selected_strategy,
            estimated_distance_delta_km,
            estimated_duration_delta_mins,
            rationale,
            decision_source
          )
        `)
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false }),

      // Dispatched Routes
      supabase
        .from("routes")
        .select(`
          id,
          status,
          route_date,
          optimized_distance_km,
          naive_distance_km,
          total_duration_mins,
          estimated_cost_vnd,
          warehouse_id,
          vehicle_id,
          shipper_id,
          created_at,
          warehouses (name, address, lat, lng),
          vehicles (name, license_plate, bag_capacity_units),
          profiles:shipper_id (name, phone)
        `)
        .eq("shop_id", shopId)
        .order("created_at", { ascending: false })
        .limit(50),

      // Vehicles
      supabase.from("vehicles").select("id, name, status, bag_capacity_units").eq("shop_id", shopId),

      // Shippers
      supabase.from("shop_members").select("id, user_id, status").eq("shop_id", shopId).eq("member_role", "shipper"),

      // Environmental Context Signals (GALM)
      supabase.from("context_signals").select("*").order("created_at", { ascending: false }).limit(5),

      // Orders for delivery stops & count
      supabase.from("orders").select("id, order_code, status, address, lat, lng, delivery_date").eq("shop_id", shopId).limit(200),
    ]);

    for (const r of [bagsRes, recoveriesRes, routesRes, vehiclesRes, shippersRes, contextRes, ordersRes]) {
      if (r.error) throw r.error;
    }

    const bags = bagsRes.data ?? [];
    const recoveries = recoveriesRes.data ?? [];
    const routes = routesRes.data ?? [];
    const vehicles = vehiclesRes.data ?? [];
    const shippers = shippersRes.data ?? [];
    const contextSignals = contextRes.data ?? [];
    const orders = ordersRes.data ?? [];

    // 3. PaaS Bag Fleet Breakdown
    const totalBags = bags.length;
    const bagsWithCustomer = bags.filter((b) => b.status === "with_customer").length;
    const bagsAwaitingRecovery = bags.filter((b) => b.status === "return_requested").length;
    const bagsRecovering = bags.filter((b) => b.status === "recovering").length;
    const bagsAtHub = bags.filter((b) => b.status === "at_hub").length;
    const bagsInInspection = bags.filter((b) => b.status === "inspection").length;
    const bagsInMaintenance = bags.filter((b) => b.status === "maintenance").length;
    const bagsReadyForReuse = bags.filter((b) => b.status === "ready_for_reuse").length;
    const bagsAvailable = bags.filter((b) => b.status === "available").length;
    const bagsRetired = bags.filter((b) => ["retired", "damaged"].includes(b.status)).length;
    const bagsInCirculation = bags.filter((b) =>
      ["assigned", "in_delivery", "with_customer", "return_requested", "recovering"].includes(b.status)
    ).length;

    // 4. Recovery Requests Pipeline
    const activeRecoveries = recoveries.filter((r) =>
      ["requested", "planned", "assigned", "in_transit"].includes(r.status)
    );
    const completedRecoveries = recoveries.filter((r) => r.status === "completed");
    const strategyACount = recoveries.filter((r) => r.recovery_strategy === "strategy_a_merged").length;
    const strategyCCount = recoveries.filter((r) => r.recovery_strategy === "strategy_c_dedicated").length;

    // 5. KPI Layer Calculation (Deterministic, Auditable, No Fabricated Values)
    // KPI 1: Cost per Order
    // The current system does not have a reliable per-order fulfillment cost source.
    // routes.estimated_cost_vnd is a route-level estimate and cannot currently be reliably attributed to individual orders.
    // Therefore Cost per Order must not be calculated from it and no fabricated value is displayed.
    const kpiCostPerOrder = {
      value: null,
      display: "N/A",
      status: "INSUFFICIENT_DATA" as const,
      formula: "Tổng chi phí hoàn tất đơn / Số đơn hàng hoàn tất (Cost / Order)",
      source_tables: ["public.orders", "public.routes.estimated_cost_vnd"],
      time_window: "All-time",
      is_data_sufficient: false,
      reason: "No reliable per-order fulfillment cost source.",
      documentation:
        "routes.estimated_cost_vnd là chi phí ước tính ở cấp độ toàn tuyến và hiện tại không thể quy kết một cách tin cậy cho từng đơn hàng riêng lẻ; do đó chi phí mỗi đơn hàng (Cost per Order) không được tính toán từ trường này và hệ thống trả về N/A, không hiển thị giá trị suy diễn giả định.",
    };

    // KPI 2: Bag Recovery Rate
    // Formula: (Completed Recoveries / Total Requested Recoveries) * 100
    const totalRecoveryRequestsCount = recoveries.length;
    const completedRecoveriesCount = completedRecoveries.length;
    const recoveryRateValue =
      totalRecoveryRequestsCount > 0
        ? Number(((completedRecoveriesCount / totalRecoveryRequestsCount) * 100).toFixed(1))
        : null;

    const kpiRecoveryRate = {
      value: recoveryRateValue,
      display: recoveryRateValue !== null ? `${recoveryRateValue}%` : "Chưa có lượt",
      status: totalRecoveryRequestsCount > 0 ? ("VALID" as const) : ("NO_DATA" as const),
      formula: "(Số lượt thu hồi hoàn tất / Tổng lượt yêu cầu thu hồi) × 100%",
      source_tables: ["public.recovery_requests"],
      time_window: "All-time",
      is_data_sufficient: totalRecoveryRequestsCount > 0,
      completed_count: completedRecoveriesCount,
      total_count: totalRecoveryRequestsCount,
      documentation:
        "Tính từ vòng đời thực tế của các yêu cầu thu hồi trong recovery_requests. Đạt chuẩn khi túi được shipper bàn giao và Hub tiếp nhận.",
    };

    // KPI 3: Actual Reuse Cycles per PaaS Bag
    // Formula: SUM(usage_count) / Total PaaS Bags
    const totalUsageSum = bags.reduce((sum, b) => sum + (b.usage_count || 0), 0);
    const avgReuseCycles = totalBags > 0 ? Number((totalUsageSum / totalBags).toFixed(1)) : 0;

    const kpiReuseCycles = {
      value: avgReuseCycles,
      display: `${avgReuseCycles} vòng/túi`,
      status: totalBags > 0 ? ("VALID" as const) : ("NO_DATA" as const),
      formula: "∑(paas_bags.usage_count) / Tổng số túi PaaS",
      source_tables: ["public.paas_bags.usage_count"],
      time_window: "Toàn bộ vòng đời túi",
      is_data_sufficient: totalBags > 0,
      total_cycles: totalUsageSum,
      fleet_size: totalBags,
      documentation:
        "Số vòng tái sử dụng thực tế được tăng đúng 1 lần khi túi vượt qua kiểm định chất lượng tại Hub và chứng nhận ready_for_reuse (bảo toàn nghiêm ngặt semantic của GB-002).",
    };

    // 6. Active Route & GALM Map Points
    const activeRoute = routes.find((r) => ["in_progress", "assigned", "approved"].includes(r.status)) || routes[0] || null;

    let mapPoints: Array<{
      id: string;
      label: string;
      lat: number;
      lng: number;
      kind: "warehouse" | "delivery" | "recovery";
      status?: string;
      sequence?: number;
      bag_code?: string;
      address?: string;
    }> = [];

    if (activeRoute) {
      const warehouse = Array.isArray(activeRoute.warehouses) ? activeRoute.warehouses[0] : activeRoute.warehouses;
      if (warehouse?.lat != null && warehouse?.lng != null) {
        mapPoints.push({
          id: `wh-${activeRoute.id}`,
          label: `Hub / Kho: ${warehouse.name || "Trung tâm PaaS"}`,
          lat: Number(warehouse.lat),
          lng: Number(warehouse.lng),
          kind: "warehouse",
          status: "active",
          address: warehouse.address,
        });
      }

      // Fetch route stops for the active route
      const { data: routeStops } = await supabase
        .from("route_stops")
        .select("id, stop_type, order_id, recovery_request_id, sequence_index, status")
        .eq("route_id", activeRoute.id)
        .order("sequence_index", { ascending: true });

      const stops = routeStops || [];
      const orderIds = stops.map((s) => s.order_id).filter(Boolean) as string[];
      const recoveryIds = stops.map((s) => s.recovery_request_id).filter(Boolean) as string[];

      const [stopOrdersRes, stopRecRes] = await Promise.all([
        orderIds.length
          ? supabase.from("orders").select("id, order_code, address, lat, lng, status").in("id", orderIds)
          : Promise.resolve({ data: [] }),
        recoveryIds.length
          ? supabase
              .from("recovery_requests")
              .select("id, pickup_address, lat, lng, status, paas_bags(bag_code)")
              .in("id", recoveryIds)
          : Promise.resolve({ data: [] }),
      ]);

      const orderMap = new Map((stopOrdersRes.data || []).map((o: any) => [o.id, o]));
      const recMap = new Map((stopRecRes.data || []).map((r: any) => [r.id, r]));

      for (const stop of stops) {
        if (stop.stop_type === "delivery" && stop.order_id && orderMap.has(stop.order_id)) {
          const ord = orderMap.get(stop.order_id)!;
          if (ord.lat != null && ord.lng != null) {
            mapPoints.push({
              id: `del-${ord.id}`,
              label: `Giao hàng: ${ord.order_code}`,
              lat: Number(ord.lat),
              lng: Number(ord.lng),
              kind: "delivery",
              status: stop.status || ord.status,
              sequence: stop.sequence_index,
              address: ord.address,
            });
          }
        } else if (stop.stop_type === "recovery" && stop.recovery_request_id && recMap.has(stop.recovery_request_id)) {
          const rec = recMap.get(stop.recovery_request_id)!;
          if (rec.lat != null && rec.lng != null) {
            mapPoints.push({
              id: `rec-${rec.id}`,
              label: `Thu hồi túi: ${(rec as any).paas_bags?.bag_code || "PaaS"}`,
              lat: Number(rec.lat),
              lng: Number(rec.lng),
              kind: "recovery",
              status: stop.status || rec.status,
              sequence: stop.sequence_index,
              bag_code: (rec as any).paas_bags?.bag_code,
              address: rec.pickup_address,
            });
          }
        }
      }
    }

    // 7. Route Summary Stats
    const routeSummary = routes.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

    // 8. GALM Simulated Context Signal
    const latestSignal = contextSignals[0] || null;
    const galmContext = {
      is_simulated: true,
      source: "SIMULATED" as const,
      weather_condition: latestSignal?.signal_data?.weather || "CLEAR",
      traffic_level: latestSignal?.signal_data?.traffic || "normal",
      flood_risk: latestSignal?.signal_data?.flood_risk || "none",
      severity_level: latestSignal?.severity_level || "low",
      captured_at: latestSignal?.created_at || new Date().toISOString(),
      label: "[SIMULATED] Tín hiệu môi trường giả lập cho GALM Decision Engine",
    };

    return NextResponse.json({
      success: true,
      data: {
        // PaaS Bag Fleet Summary
        fleet: {
          total_bags: totalBags,
          in_circulation: bagsInCirculation,
          with_customer: bagsWithCustomer,
          awaiting_recovery: bagsAwaitingRecovery,
          recovering: bagsRecovering,
          at_hub: bagsAtHub,
          in_inspection: bagsInInspection,
          in_maintenance: bagsInMaintenance,
          ready_for_reuse: bagsReadyForReuse,
          available: bagsAvailable,
          retired: bagsRetired,
        },
        // Recovery Overview Summary
        recoveries_pipeline: {
          total: totalRecoveryRequestsCount,
          active: activeRecoveries.length,
          completed: completedRecoveries.length,
          strategy_a: strategyACount,
          strategy_c: strategyCCount,
          recent: recoveries.slice(0, 10).map((r: any) => ({
            id: r.id,
            status: r.status,
            strategy: r.recovery_strategy,
            bag_code: r.paas_bags?.bag_code || "PaaS",
            usage_count: r.paas_bags?.usage_count || 0,
            pickup_date: r.pickup_date,
            address: r.pickup_address,
            decision: r.recovery_decisions?.[0] || null,
          })),
        },
        // Three Business KPIs
        kpis: {
          cost_per_order: kpiCostPerOrder,
          recovery_rate: kpiRecoveryRate,
          actual_reuse_cycles: kpiReuseCycles,
        },
        // Route & Map Data
        routes: {
          active_route: activeRoute,
          summary: routeSummary,
          active_vehicles_count: vehicles.filter((v) => v.status === "active").length,
          total_vehicles_count: vehicles.length,
          active_shippers_count: shippers.filter((s) => s.status === "active").length,
          map_points: mapPoints,
        },
        // GALM Environmental Context
        galm_context: galmContext,
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
