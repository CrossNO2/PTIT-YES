import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pickupId } = await params;
    await requireUser();
    const rate = await checkRateLimit("pickup_qr_verify", { max: 20, windowMs: 60_000 });
    if (!rate.success) return jsonError("Quá nhiều lần xác thực QR. Vui lòng thử lại sau.", "RATE_LIMITED", 429);

    const body = await request.json();
    const { qr_token, actual_weight_kg } = body;

    if (!qr_token || typeof actual_weight_kg !== "number" || actual_weight_kg <= 0) {
      return jsonError("Khối lượng xác thực thực tế phải lớn hơn 0", "INVALID_INPUT", 400);
    }

    const supabase = await createClient();

    // Call atomic SQL RPC using auth.uid() internally
    const { data, error } = await supabase.rpc("verify_pickup_qr", {
      p_pickup_id: pickupId,
      p_qr_token: qr_token,
      p_actual_weight_kg: actual_weight_kg,
    });

    if (error) {
      return jsonError(error.message, "RPC_VERIFY_FAILED", 400);
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
