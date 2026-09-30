import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireHubOperator } from "@/lib/auth/require-hub-operator";
import { formatErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get("status");
    const warehouseId = searchParams.get("warehouse_id");
    const shopId = searchParams.get("shop_id");

    // Enforce Authentication + Role (platform_admin or shop_user with owner/admin/dispatcher)
    // + Operational Scope (user must belong to the shop owning this warehouse)
    const operator = await requireHubOperator(warehouseId, shopId);
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
        current_warehouse_id,
        current_shop_id,
        current_location_type,
        current_holder_type,
        last_inspected_at,
        last_cleaned_at,
        created_at,
        updated_at,
        warehouses:current_warehouse_id (
          id,
          name,
          address,
          shop_id
        )
      `)
      .in("status", [
        "at_hub",
        "inspection",
        "maintenance",
        "ready_for_reuse",
        "damaged",
        "retired",
      ])
      .order("updated_at", { ascending: false });

    // If shop_user (not platform_admin), scope to the operator's shop
    if (!operator.isPlatformAdmin && operator.shopId) {
      query = query.eq("current_shop_id", operator.shopId);
    }

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }
    if (warehouseId) {
      query = query.eq("current_warehouse_id", warehouseId);
    }

    const { data: bags, error } = await query;
    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: bags || [],
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
