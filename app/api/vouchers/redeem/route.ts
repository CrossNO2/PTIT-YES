import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const rate = await checkRateLimit("voucher_redeem", { max: 10, windowMs: 60_000 });
    if (!rate.success) return jsonError("Bạn đang đổi voucher quá nhanh. Vui lòng thử lại sau.", "RATE_LIMITED", 429);
    const body = await request.json();
    const { voucher_id } = body;

    if (!voucher_id) {
      return jsonError("voucher_id parameter is required", "MISSING_VOUCHER_ID", 400);
    }

    const supabase = await createClient();

    // Delegate to atomic RPC
    const { data, error } = await supabase.rpc("redeem_voucher", {
      p_voucher_id: voucher_id,
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: {
        redemption_id: data.redemption_id,
        redemption_code: data.redemption_code,
        qrToken: data.raw_qr_token,
        qr_expires_at: data.qr_expires_at,
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
