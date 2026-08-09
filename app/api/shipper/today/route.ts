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

    const { data: pickups, error: pickupsError } = await supabase
      .from("packaging_pickups")
      .select("id,address,lat,lng,packaging_type,estimated_quantity_kg,verified_quantity_kg,status,assigned_route_id")
      .eq("assigned_route_id", route.id);
    if (pickupsError) throw pickupsError;

    return NextResponse.json({
      success: true,
      data: {
        route,
        stops: stops || [],
        orders: (ordersData || []).filter((order: { assigned_route_id?: string | null }) => order.assigned_route_id === route.id),
        pickups: pickups || [],
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
