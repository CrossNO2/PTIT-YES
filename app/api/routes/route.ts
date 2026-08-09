import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireShopMembership } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shop_id");
    const routeDate = searchParams.get("route_date");

    if (!shopId) {
      return jsonError("shop_id parameter is required", "MISSING_SHOP_ID", 400);
    }

    await requireShopMembership(shopId);
    const supabase = await createClient();

    let query = supabase
      .from("routes")
      .select("*, warehouses!warehouse_id(name), vehicles!vehicle_id(name, vehicle_type), route_stops(*)")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (routeDate) {
      query = query.eq("route_date", routeDate);
    }

    const { data: routes, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, data: routes || [] });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shop_id, warehouse_id, route_date, optimization_version, routes } = body;

    if (!shop_id || !warehouse_id || !route_date || !Array.isArray(routes) || routes.length === 0) {
      return jsonError("Dữ liệu phê duyệt tuyến không hợp lệ", "INVALID_INPUT", 400);
    }

    await requireShopMembership(shop_id, ["owner", "admin", "dispatcher"]);
    const supabase = await createClient();

    // Translate frontend camelCase route model into the SQL RPC contract.
    const rpcRoutes = routes.map((route) => ({
      vehicle_id: route.vehicleId,
      shipper_id: route.shipperId ?? null,
      total_distance_km: route.totalDistanceKm,
      total_duration_mins: route.totalDurationMins,
      estimated_cost_vnd: route.estimatedCostVnd,
      naive_distance_km: route.naiveDistanceKm ?? 0,
      stops: (route.stops ?? []).map((stop: Record<string, unknown>) => ({
        stopType: stop.stopType,
        orderId: stop.orderId ?? null,
        pickupId: stop.pickupId ?? null,
        sequenceIndex: stop.sequenceIndex,
        distanceFromPreviousKm: stop.distanceFromPreviousKm ?? 0,
        durationFromPreviousMins: stop.durationFromPreviousMins ?? 0,
      })),
    }));

    const { data, error } = await supabase.rpc("approve_optimized_routes", {
      p_shop_id: shop_id,
      p_warehouse_id: warehouse_id,
      p_route_date: route_date,
      p_optimization_version: optimization_version || 1,
      p_routes: rpcRoutes,
    });

    if (error) {
      return jsonError(error.message, "RPC_APPROVE_FAILED", 400);
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
