import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: routeId } = await params;
    await requireUser();
    const supabase = await createClient();

    const { data: route, error } = await supabase
      .from("routes")
      .select("*, warehouses!warehouse_id(*), vehicles!vehicle_id(*), route_stops(*)")
      .eq("id", routeId)
      .single();

    if (error || !route) {
      return jsonError(`Tuyến đường ${routeId} không tồn tại`, "NOT_FOUND", 404);
    }

    return NextResponse.json({
      success: true,
      data: route,
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
