import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";
import { z } from "zod";
import crypto from "crypto";

const createPickupSchema = z.object({
  packaging_type: z.string().min(1, "Vui lòng chọn loại bao bì"),
  estimated_quantity_kg: z.number().positive("Khối lượng phải lớn hơn 0"),
  address: z.string().min(5, "Địa chỉ phải từ 5 ký tự trở lên"),
  pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày nhận không hợp lệ"),
  available_from: z.string().min(1, "Giờ bắt đầu không hợp lệ"),
  available_until: z.string().min(1, "Giờ kết thúc không hợp lệ"),
});

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser();
    const supabase = await createClient();

    const body = await request.json();
    const validated = createPickupSchema.parse(body);

    // 1. Resolve the operational GreenBridge shop. Migration 11 bootstraps this record idempotently.
    const { data: defaultShop, error: shopError } = await supabase
      .from("shops")
      .select("id")
      .eq("slug", "greenbridge-main")
      .eq("is_active", true)
      .maybeSingle();

    if (shopError || !defaultShop) {
      return jsonError(
        "Cấu hình vận hành GreenBridge chưa được khởi tạo. Hãy chạy migration/query 11.",
        "OPERATIONAL_SHOP_NOT_CONFIGURED",
        503
      );
    }

    // 2. Geocode with OpenStreetMap/Nominatim. Never invent fallback coordinates.
    const geoRes = await fetch(new URL("/api/geocoding", request.url).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: validated.address }),
    });
    const geoJson = await geoRes.json();
    if (!geoRes.ok || !geoJson.success || !geoJson.data) {
      return jsonError(
        geoJson.error?.message || "Không xác định được tọa độ cho địa chỉ thu gom",
        "GEOCODING_FAILED",
        geoRes.status >= 400 ? geoRes.status : 400
      );
    }
    const lat = Number(geoJson.data.lat);
    const lng = Number(geoJson.data.lng);

    // 3. Generate Crypto QR Token (Raw token returned to customer UI, SHA-256 stored in DB)
    const rawQrToken = crypto.randomBytes(32).toString("base64");
    const qrTokenHash = crypto.createHash("sha256").update(rawQrToken).digest("hex");
    const qrExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // 4. INSERT into packaging_pickups table
    const { data: pickup, error: insertError } = await supabase
      .from("packaging_pickups")
      .insert({
        shop_id: defaultShop.id,
        customer_id: user.id,
        address: validated.address,
        lat,
        lng,
        packaging_type: validated.packaging_type,
        estimated_quantity_kg: validated.estimated_quantity_kg,
        pickup_date: validated.pickup_date,
        available_from: validated.available_from,
        available_until: validated.available_until,
        status: "pending",
        qr_token_hash: qrTokenHash,
        qr_expires_at: qrExpiresAt,
      })
      .select("id, status, created_at")
      .single();

    if (insertError || !pickup) {
      return jsonError("Không thể tạo yêu cầu thu gom vào CSDL: " + (insertError?.message || ""), "DB_INSERT_FAILED", 500);
    }

    return NextResponse.json({
      success: true,
      data: {
        id: pickup.id,
        status: pickup.status,
        created_at: pickup.created_at,
        raw_qr_token: rawQrToken,
        qr_expires_at: qrExpiresAt,
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
