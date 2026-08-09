import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireShopMembership } from "@/lib/auth/require-user";
import { warehouseCreateSchema } from "@/lib/validation/schemas";
import { formatErrorResponse, jsonError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shop_id");

    if (!shopId) {
      return jsonError("shop_id parameter is required", "MISSING_SHOP_ID", 400);
    }

    await requireShopMembership(shopId);
    const supabase = await createClient();

    const { data: warehouses, error } = await supabase
      .from("warehouses")
      .select("*")
      .eq("shop_id", shopId)
      .order("is_default", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data: warehouses || [] });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = warehouseCreateSchema.safeParse(body);

    if (!validated.success) {
      return jsonError("Input thông tin kho không hợp lệ", "INVALID_INPUT", 400, validated.error.flatten());
    }

    const data = validated.data;
    await requireShopMembership(data.shop_id, ["owner", "admin"]);
    const supabase = await createClient();

    if (data.is_default) {
      // Unset previous default warehouses for shop
      await supabase
        .from("warehouses")
        .update({ is_default: false })
        .eq("shop_id", data.shop_id);
    }

    const { data: warehouse, error } = await supabase
      .from("warehouses")
      .insert(data)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data: warehouse });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
