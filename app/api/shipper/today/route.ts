import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const { user } = await requireUser();
    const supabase = await createClient();

    // 1. Fetch current active or assigned route for shipper today
    const todayStr = new Date().toISOString().split("T")[0];

    const { data: route, error: routeError } = await supabase
      .from("routes")
      .select("*, warehouses(name, address, lat, lng)")
      .eq("shipper_id", user.id)
      .eq("route_date", todayStr)
      .in("status", ["assigned", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (routeError) {
      throw routeError;
    }

    if (!route) {
      return NextResponse.json({
        success: true,
        data: {
          route: null,
          stops: [],
          orders: [],
        },
      });
    }

    // 2. Fetch Route Stops for this route
    const { data: stops, error: stopsError } = await supabase
      .from("route_stops")
      .select("*")
      .eq("route_id", route.id)
      .order("sequence_index", { ascending: true });

    if (stopsError) {
      throw stopsError;
    }

    // 3. Fetch Assigned Orders for Shipper (Masked PII)
    const { data: ordersData, error: ordersError } = await supabase.rpc(
      "get_shipper_assigned_orders"
    );

    if (ordersError) {
      throw ordersError;
    }

    // 4. Fetch Assigned Recovery Requests for this route (PaaS bags)
    const { data: recoveryRequests } = await supabase
      .from("recovery_requests")
      .select(`
        id,
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
        paas_bags (
          id,
          bag_code,
          qr_code_hash,
          model_type,
          status
        ),
        profiles:customer_id (
          name,
          phone
        )
      `)
      .eq("assigned_route_id", route.id);

    const recoveries = (recoveryRequests || []).map((r: any) => ({
      id: r.id,
      recovery_request_id: r.id,
      bag_id: r.bag_id,
      bag_code: r.paas_bags?.bag_code || "PaaS Bag",
      qr_code_hash: r.paas_bags?.qr_code_hash || "",
      address: r.pickup_address,
      lat: Number(r.lat),
      lng: Number(r.lng),
      pickup_date: r.pickup_date,
      time_slot: `${(r.time_slot_start || "08:00").slice(0, 5)} - ${(r.time_slot_end || "18:00").slice(0, 5)}`,
      status: r.status,
      recovery_strategy: r.recovery_strategy,
      customer_name: r.profiles?.name || "Khách hàng",
      customer_phone_masked: r.profiles?.phone ? r.profiles.phone.replace(/(\d{3})\d{4}(\d{3})/, "$1****$2") : "090****000",
      assigned_route_id: r.assigned_route_id,
      // Compatibility fields for map and existing components
      packaging_type: r.paas_bags?.bag_code ? `Túi PaaS (${r.paas_bags.bag_code})` : "Túi PaaS GreenBridge",
      bagUnits: 1,
    }));

    return NextResponse.json({
      success: true,
      data: {
        route,
        stops: stops || [],
        orders: (ordersData || []).filter((order: { assigned_route_id?: string | null }) => order.assigned_route_id === route.id),
        recoveries,
        pickups: recoveries, // Compatibility alias
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
