import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";
import { z } from "zod";

const verifyRecoverySchema = z.object({
  scanned_qr: z.string().min(1, "Vui lòng quét hoặc nhập mã QR/mã túi"),
  condition: z.enum(["good", "needs_cleaning", "damaged", "scrapped"]).optional().default("good"),
  notes: z.string().optional().default(""),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, profile } = await requireUser();
    const { id } = await params;
    const supabase = await createClient();

    const body = await request.json();
    const validated = verifyRecoverySchema.parse(body);

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

    // 2. Call GB-002 Lifecycle RPC: verify_and_complete_bag_recovery
    // Enforces: recovering -> at_hub
    // Invariant: usage_count is NOT incremented!
    // Triggers green points & deposit refund eligibility
    const { data, error } = await supabase.rpc("verify_and_complete_bag_recovery", {
      p_recovery_request_id: id,
      p_scanned_bag_qr: validated.scanned_qr,
      p_condition: validated.condition,
    });

    if (error) {
      return jsonError(error.message, "VERIFY_RECOVERY_FAILED", 400);
    }

    // 3. Mark route stop as completed if on route
    await supabase
      .from("route_stops")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("recovery_request_id", id);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
