import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireShopMembership } from "@/lib/auth/require-user";
import { vehicleCreateSchema } from "@/lib/validation/schemas";
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

    const { data: vehicles, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data: vehicles || [] });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = vehicleCreateSchema.safeParse(body);

    if (!validated.success) {
      return jsonError("Input phương tiện không hợp lệ", "INVALID_INPUT", 400, validated.error.flatten());
    }

    const data = validated.data;
    await requireShopMembership(data.shop_id, ["owner", "admin"]);
    const supabase = await createClient();

    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .insert(data)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data: vehicle });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
