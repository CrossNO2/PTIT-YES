import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireShopMembership } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shop_id");
    const status = searchParams.get("status");
    const strategy = searchParams.get("strategy");
    const shipperId = searchParams.get("shipper_id");
    const date = searchParams.get("date");
    const q = searchParams.get("q");

    if (!shopId) {
      return jsonError("shop_id parameter is required", "MISSING_SHOP_ID", 400);
    }

    // Server-side authorization: only shop operators (owner, admin, dispatcher) can view recovery overview
    await requireShopMembership(shopId, ["owner", "admin", "dispatcher"]);
    const supabase = await createClient();

    let query = supabase
      .from("recovery_requests")
      .select(`
        id,
        shop_id,
        customer_id,
        bag_id,
        order_id,
        status,
        recovery_strategy,
        pickup_address,
        lat,
        lng,
        pickup_date,
        time_slot_start,
        time_slot_end,
        assigned_route_id,
        assigned_shipper_id,
        picked_up_at,
        completed_at,
        failure_reason,
        notes,
        created_at,
        updated_at,
        paas_bags (
          id,
          bag_code,
          qr_code_hash,
          model_type,
          size_category,
          status,
          condition,
          usage_count,
          max_cycles
        ),
        recovery_decisions (
          id,
          recommended_strategy,
          selected_strategy,
          decision_source,
          estimated_distance_delta_km,
          estimated_duration_delta_mins,
          estimated_cost_delta_vnd,
          target_route_id,
          context_signals_snapshot,
          rationale,
          created_at
        ),
        customer:customer_id (
          id,
          name,
          phone
        ),
        assigned_shipper:assigned_shipper_id (
          id,
          name,
          phone
        ),
        routes:assigned_route_id (
          id,
          route_date,
          status,
          vehicle_id,
          vehicles (
            id,
            name,
            license_plate
          )
        ),
        shops:shop_id (
          id,
          name
        )
      `)
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (strategy && strategy !== "all") {
      query = query.eq("recovery_strategy", strategy);
    }
    if (shipperId && shipperId !== "all") {
      query = query.eq("assigned_shipper_id", shipperId);
    }
    if (date) {
      query = query.eq("pickup_date", date);
    }

    const { data: recoveryList, error } = await query;
    if (error) {
      throw error;
    }

    let filtered = recoveryList || [];
    if (q) {
      const lowerQ = q.toLowerCase();
      filtered = filtered.filter((r: any) =>
        `${r.id} ${r.paas_bags?.bag_code || ""} ${r.customer?.name || ""} ${r.pickup_address || ""} ${r.notes || ""}`
          .toLowerCase()
          .includes(lowerQ)
      );
    }

    const data = filtered.map((r: any) => {
      const decision = r.recovery_decisions?.[0] || null;
      return {
        id: r.id,
        recovery_request_id: r.id,
        bag_id: r.bag_id,
        bag_code: r.paas_bags?.bag_code || "PaaS Bag",
        bag: r.paas_bags,
        customer_id: r.customer_id,
        customer: r.customer,
        shop_id: r.shop_id,
        shop_name: r.shops?.name || "GreenBridge Main Shop",
        address: r.pickup_address,
        lat: r.lat,
        lng: r.lng,
        pickup_date: r.pickup_date,
        time_slot: `${(r.time_slot_start || "08:00").slice(0, 5)} - ${(r.time_slot_end || "18:00").slice(0, 5)}`,
        status: r.status,
        recovery_strategy: r.recovery_strategy,
        assigned_shipper_id: r.assigned_shipper_id,
        assigned_shipper: r.assigned_shipper,
        assigned_route_id: r.assigned_route_id,
        route: r.routes,
        decision,
        notes: r.notes,
        failure_reason: r.failure_reason,
        picked_up_at: r.picked_up_at,
        completed_at: r.completed_at,
        created_at: r.created_at,
      };
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
