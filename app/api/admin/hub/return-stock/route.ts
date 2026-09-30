import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireHubOperator } from "@/lib/auth/require-hub-operator";
import { formatErrorResponse, jsonError } from "@/lib/errors";
import { z } from "zod";

const returnStockSchema = z.object({
  bag_id: z.string().uuid("ID túi không hợp lệ"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = returnStockSchema.parse(body);
    const supabase = await createClient();

    // 1. Fetch bag to check current warehouse/shop scope
    const { data: bag, error: bagError } = await supabase
      .from("paas_bags")
      .select("id, bag_code, status, current_warehouse_id, current_shop_id")
      .eq("id", validated.bag_id)
      .maybeSingle();

    if (bagError || !bag) {
      return jsonError("Không tìm thấy túi PaaS", "BAG_NOT_FOUND", 404);
    }

    // 2. Enforce Authentication + Role + Operational Scope
    await requireHubOperator(bag.current_warehouse_id, bag.current_shop_id);

    // 3. Call GB-002 RPC: return_bag_to_stock
    // Enforces: ready_for_reuse -> available
    const { data, error } = await supabase.rpc("return_bag_to_stock", {
      p_bag_id: validated.bag_id,
    });

    if (error) {
      return jsonError(error.message, "RETURN_TO_STOCK_FAILED", 400);
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
