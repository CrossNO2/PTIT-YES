import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireHubOperator } from "@/lib/auth/require-hub-operator";
import { formatErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shop_id");
    const status = searchParams.get("status");
    const q = searchParams.get("q");

    // Server-side authorization
    const operator = await requireHubOperator(null, shopId);
    const supabase = await createClient();

    let query = supabase
      .from("paas_bags")
      .select(`
        id,
        bag_code,
        qr_code_hash,
        status,
        condition,
        model_type,
        size_category,
        usage_count,
        max_cycles,
        current_shop_id,
        current_holder_type,
        current_holder_user_id,
        current_location_type,
        current_warehouse_id,
        created_at,
        updated_at,
        warehouses:current_warehouse_id (
          id,
          name,
          address
        ),
        shops:current_shop_id (
          id,
          name
        )
      `)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (!operator.isPlatformAdmin && operator.shopId) {
      query = query.eq("current_shop_id", operator.shopId);
    } else if (shopId) {
      query = query.eq("current_shop_id", shopId);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (q) {
      query = query.or(`bag_code.ilike.%${q}%,qr_code_hash.ilike.%${q}%`);
    }

    const { data: bags, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: bags || [],
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
