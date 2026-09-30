import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireShopMembership } from "@/lib/auth/require-user";
import { runOptimizationEngine } from "@/lib/optimization/greedy-vrp";
import { insertPickupsIntoRoute, insertRecoveryRequestsIntoRoute } from "@/lib/optimization/reverse-logistics";
import { checkRateLimit } from "@/lib/rate-limit";
import { formatErrorResponse, jsonError } from "@/lib/errors";
import { z } from "zod";

const schema = z.object({
  shop_id: z.string().uuid(),
  warehouse_id: z.string().uuid(),
  delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  order_ids: z.array(z.string().uuid()).max(250).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return jsonError("Dữ liệu tối ưu không hợp lệ", "INVALID_INPUT", 400, parsed.error.flatten());
    const { shop_id, warehouse_id, delivery_date, order_ids } = parsed.data;

    await requireShopMembership(shop_id, ["owner", "admin", "dispatcher"]);
    const rate = await checkRateLimit("route_optimize", { max: 15, windowMs: 60_000 });
    if (!rate.success) return jsonError("Bạn đang chạy tối ưu quá nhanh. Hãy thử lại sau ít phút.", "RATE_LIMITED", 429);
    const supabase = await createClient();

    const { data: warehouse, error: whError } = await supabase.from("warehouses").select("*").eq("id", warehouse_id).eq("shop_id", shop_id).eq("status", "active").single();
    if (whError || !warehouse) return jsonError("Kho không tồn tại hoặc không hoạt động", "WAREHOUSE_NOT_FOUND", 404);

    let ordersQuery = supabase.from("orders").select("*").eq("shop_id", shop_id).eq("delivery_date", delivery_date).eq("status", "ready").is("assigned_route_id", null);
    if (order_ids?.length) ordersQuery = ordersQuery.in("id", order_ids);
    const { data: orders, error: ordError } = await ordersQuery;
    if (ordError) throw ordError;
    if (!orders?.length) return jsonError(`Không có đơn ở trạng thái ready để tối ưu cho ngày ${delivery_date}`, "NO_ORDERS", 400);

    const { data: vehicles, error: vehError } = await supabase.from("vehicles").select("*").eq("shop_id", shop_id).eq("status", "active");
    if (vehError || !vehicles?.length) return jsonError("Shop chưa có phương tiện active", "NO_ACTIVE_VEHICLES", 400);

    // Fetch v2 PaaS recovery requests (Strategy A candidates)
    const { data: recoveries, error: recoveryError } = await supabase
      .from("recovery_requests")
      .select("*")
      .eq("shop_id", shop_id)
      .eq("pickup_date", delivery_date)
      .in("status", ["requested", "planned"])
      .is("assigned_route_id", null);
    if (recoveryError) throw recoveryError;

    // Optional legacy pickups
    const { data: legacyPickups } = await supabase
      .from("packaging_pickups")
      .select("*")
      .eq("shop_id", shop_id)
      .eq("pickup_date", delivery_date)
      .eq("status", "pending")
      .is("assigned_route_id", null);

    const result = await runOptimizationEngine(warehouse, orders, vehicles);
    let remainingRecoveries = [...(recoveries ?? [])];
    let remainingPickups = [...(legacyPickups ?? [])];

    result.routes = result.routes.map((route) => {
      const vehicle = vehicles.find((v) => v.id === route.vehicleId);
      if (!vehicle) return route;

      let currentRoute = route;
      // 1. Insert v2 PaaS Recovery Requests
      if (remainingRecoveries.length > 0) {
        const insertedRecovery = insertRecoveryRequestsIntoRoute(currentRoute, remainingRecoveries, vehicle);
        remainingRecoveries = remainingRecoveries.filter(
          (r) => !insertedRecovery.insertedRecoveryRequestIds.includes(r.id)
        );
        currentRoute = insertedRecovery.updatedRoute;
      }

      // 2. Insert legacy pickups if present
      if (remainingPickups.length > 0) {
        const insertedPickups = insertPickupsIntoRoute(currentRoute, remainingPickups, vehicle);
        remainingPickups = remainingPickups.filter(
          (p) => !insertedPickups.insertedPickups.includes(p.id)
        );
        currentRoute = insertedPickups.updatedRoute;
      }

      return currentRoute;
    });

    result.optimizedDistanceKm = Number(result.routes.reduce((sum, route) => sum + route.totalDistanceKm, 0).toFixed(2));
    result.totalKmSaved = Number(Math.max(0, result.naiveDistanceKm - result.optimizedDistanceKm).toFixed(2));
    const representative = vehicles[0];
    result.estimatedCo2SavedKg = Number((result.totalKmSaved * Number(representative?.co2_kg_per_km ?? 0)).toFixed(4));
    result.estimatedCostSavedVnd = Number((result.totalKmSaved * Number(representative?.fuel_cost_vnd_per_km ?? 0)).toFixed(2));

    const totalReverseCandidates = (recoveries?.length ?? 0) + (legacyPickups?.length ?? 0);
    const totalRemaining = remainingRecoveries.length + remainingPickups.length;
    const totalInserted = totalReverseCandidates - totalRemaining;

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        reverseLogistics: {
          inserted: totalInserted,
          pendingNotInserted: totalRemaining,
          paasRecoveriesInserted: (recoveries?.length ?? 0) - remainingRecoveries.length,
        },
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
