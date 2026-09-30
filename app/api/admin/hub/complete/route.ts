import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireHubOperator } from "@/lib/auth/require-hub-operator";
import { formatErrorResponse, jsonError } from "@/lib/errors";
import { z } from "zod";

const completeInspectionSchema = z.object({
  bag_id: z.string().uuid("ID túi không hợp lệ"),
  warehouse_id: z.string().uuid("ID kho không hợp lệ"),
  result: z.enum(["passed", "needs_wash", "repaired", "degraded", "scrapped"]),
  action: z.enum(["inspected_ok", "washed_sanitized", "stitched_repaired", "scrapped"]),
  notes: z.string().optional().default(""),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = completeInspectionSchema.parse(body);

    // 1. Enforce Authentication + Role + Operational Scope
    await requireHubOperator(validated.warehouse_id);
    const supabase = await createClient();

    // 2. Validate bag exists and belongs to the operational warehouse
    const { data: bag, error: bagError } = await supabase
      .from("paas_bags")
      .select("id, bag_code, status, current_warehouse_id")
      .eq("id", validated.bag_id)
      .maybeSingle();

    if (bagError || !bag) {
      return jsonError("Không tìm thấy túi PaaS", "BAG_NOT_FOUND", 404);
    }

    if (bag.current_warehouse_id && bag.current_warehouse_id !== validated.warehouse_id) {
      return jsonError(
        "Túi không thuộc phạm vi kho bãi bạn đang quản lý",
        "CROSS_WAREHOUSE_FORBIDDEN",
        403
      );
    }

    // 3. Call GB-002 Core Reusability Accounting RPC: complete_bag_inspection_washing
    // INVARIANT: usage_count ONLY increments when result === 'passed' and transitions to ready_for_reuse
    const { data, error } = await supabase.rpc("complete_bag_inspection_washing", {
      p_bag_id: validated.bag_id,
      p_warehouse_id: validated.warehouse_id,
      p_result: validated.result,
      p_action: validated.action,
      p_notes: validated.notes,
    });

    if (error) {
      return jsonError(error.message, "COMPLETE_INSPECTION_FAILED", 400);
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
