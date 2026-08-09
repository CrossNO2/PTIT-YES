import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/geocoding";
import { jsonError, formatErrorResponse } from "@/lib/errors";
import { requireUser } from "@/lib/auth/require-user";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";

const geocodeSchema = z.object({
  address: z.string().min(3, "Địa chỉ phải có ít nhất 3 ký tự"),
});

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const rate = await checkRateLimit("geocoding", { max: 1, windowMs: 1_000 });
    if (!rate.success) return jsonError("Quá nhiều yêu cầu tìm tọa độ. Vui lòng thử lại sau.", "RATE_LIMITED", 429);

    const body = await request.json();
    const validated = geocodeSchema.safeParse(body);

    if (!validated.success) {
      return jsonError("Input không hợp lệ", "INVALID_INPUT", 400, validated.error.flatten());
    }

    const result = await geocodeAddress(validated.data.address);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
