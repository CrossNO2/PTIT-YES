import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, profile } = await requireUser();
    const { id } = await params;
    const supabase = await createClient();

    // 1. Fetch recovery request and verify shipper authorization
    const { data: recovery, error: recError } = await supabase
      .from("recovery_requests")
      .select("id, status, assigned_shipper_id, assigned_route_id, routes:assigned_route_id(shipper_id)")
      .eq("id", id)
      .maybeSingle();

    if (recError || !recovery) {
      return jsonError("Không tìm thấy yêu cầu thu gom", "RECOVERY_NOT_FOUND", 404);
    }

    // Role check: Platform admin is permitted; otherwise shipper must match assignment
    const isPlatformAdmin = profile.account_type === "platform_admin";
    if (!isPlatformAdmin) {
      if (recovery.assigned_shipper_id && recovery.assigned_shipper_id !== user.id) {
        return jsonError(
          "Yêu cầu thu gom này đã được phân công cho tài xế khác",
          "FORBIDDEN_SHIPPER_MISMATCH",
          403
        );
      }

      const routeShipperId = (recovery.routes as any)?.shipper_id;
      if (routeShipperId && routeShipperId !== user.id) {
        return jsonError(
          "Yêu cầu thu gom này thuộc tuyến giao hàng của tài xế khác",
          "FORBIDDEN_ROUTE_SHIPPER_MISMATCH",
          403
        );
      }
    }

    // 2. Call GB-002 Lifecycle RPC: start_bag_recovery
    // Enforces: return_requested -> recovering
    // Custody: transferred to shipper (user.id)
    const { data, error } = await supabase.rpc("start_bag_recovery", {
      p_recovery_request_id: id,
      p_shipper_id: user.id,
    });

    if (error) {
      return jsonError(error.message, "START_RECOVERY_FAILED", 400);
    }

    // 3. Mark route stop as in_progress if on route
    await supabase
      .from("route_stops")
      .update({
        status: "arrived",
        arrived_at: new Date().toISOString(),
      })
      .eq("recovery_request_id", id)
      .eq("status", "pending");

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
