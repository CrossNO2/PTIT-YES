import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { generateQrDataUri } from "@/lib/qr";
import { formatErrorResponse, jsonError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET(_request: NextRequest,{ params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: pickupId } = await params;
    await requireUser();
    const rate = await checkRateLimit("pickup_qr_rotate", { max: 10, windowMs: 60_000 });
    if (!rate.success) return jsonError("Bạn đang tạo QR quá nhanh. Vui lòng thử lại sau.", "RATE_LIMITED", 429);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("rotate_pickup_qr", { p_pickup_id: pickupId });
    if (error || !data?.raw_qr_token) return jsonError(error?.message || "Không thể tạo QR", "QR_ROTATION_FAILED", 400);
    const qrDataUri = await generateQrDataUri({ pickupId, token: data.raw_qr_token, type: "pickup" });
    return NextResponse.json({ success: true, data: { pickupId, qrDataUri, expiresAt: data.qr_expires_at } });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
