import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireShopMembership } from "@/lib/auth/require-user";
import { geocodeAddress } from "@/lib/geocoding";
import { orderBulkImportRowSchema } from "@/lib/validation/schemas";
import { formatErrorResponse, jsonError } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shop_id, orders } = body;

    if (!shop_id || !Array.isArray(orders) || orders.length === 0 || orders.length > 10) {
      return jsonError("Dữ liệu không hợp lệ; tối đa 10 đơn mỗi lần import để tuân thủ giới hạn geocoding công cộng", "INVALID_INPUT", 400);
    }

    await requireShopMembership(shop_id, ["owner", "admin", "dispatcher"]);
    const supabase = await createClient();

    const results = [];
    const errors = [];

    for (let i = 0; i < orders.length; i++) {
      const row = orders[i];
      const parsed = orderBulkImportRowSchema.safeParse(row);

      if (!parsed.success) {
        errors.push({
          index: i,
          order_code: row.order_code || `Row #${i + 1}`,
          reason: "INVALID_FORMAT",
          details: parsed.error.flatten(),
        });
        continue;
      }

      const item = parsed.data;

      // Perform Geocoding
      try {
        const geo = await geocodeAddress(item.address);

        const { data: insertedOrder, error: insertError } = await supabase
          .from("orders")
          .insert({
            shop_id,
            order_code: item.order_code,
            customer_name: item.customer_name,
            customer_phone: item.customer_phone,
            address: geo.formattedAddress,
            lat: geo.lat,
            lng: geo.lng,
            delivery_date: item.delivery_date,
            time_slot_start: item.time_slot_start,
            time_slot_end: item.time_slot_end,
            weight_kg: item.weight_kg,
            priority: item.priority,
            notes: item.notes || null,
            status: "ready",
          })
          .select()
          .single();

        if (insertError) {
          errors.push({
            index: i,
            order_code: item.order_code,
            reason: "DATABASE_ERROR",
            details: insertError.message,
          });
        } else {
          results.push(insertedOrder);
        }
      } catch (geoErr: unknown) {
        errors.push({
          index: i,
          order_code: item.order_code,
          reason: "GEOCODING_FAILED",
          details: geoErr instanceof Error ? geoErr.message : "Geocoding failed",
        });
      }

      if (i < orders.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    }

    return NextResponse.json({
      success: true,
      importedCount: results.length,
      failedCount: errors.length,
      data: results,
      errors,
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
