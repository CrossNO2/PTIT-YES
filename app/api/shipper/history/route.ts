import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const { user } = await requireUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("routes")
      .select("id,route_date,status,optimized_distance_km,total_duration_mins,completed_at,vehicles(name,license_plate),route_stops(id)")
      .eq("shipper_id", user.id)
      .in("status", ["completed", "cancelled"])
      .order("route_date", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ success: true, data: data || [] });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
