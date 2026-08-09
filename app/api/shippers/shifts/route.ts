import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireShopMembership } from "@/lib/auth/require-user";
import { shipperShiftCreateSchema } from "@/lib/validation/schemas";
import { formatErrorResponse, jsonError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shop_id");
    const shiftDate = searchParams.get("shift_date");

    if (!shopId) {
      return jsonError("shop_id parameter is required", "MISSING_SHOP_ID", 400);
    }

    await requireShopMembership(shopId);
    const supabase = await createClient();

    let query = supabase
      .from("shipper_shifts")
      .select("*, profiles!shipper_id(id, name, phone, email)")
      .eq("shop_id", shopId)
      .order("shift_date", { ascending: true });

    if (shiftDate) {
      query = query.eq("shift_date", shiftDate);
    }

    const { data: shifts, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, data: shifts || [] });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = shipperShiftCreateSchema.safeParse(body);

    if (!validated.success) {
      return jsonError("Input ca làm việc không hợp lệ", "INVALID_INPUT", 400, validated.error.flatten());
    }

    const data = validated.data;
    await requireShopMembership(data.shop_id, ["owner", "admin", "dispatcher"]);
    const supabase = await createClient();

    const { data: shift, error } = await supabase
      .from("shipper_shifts")
      .insert(data)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data: shift });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
