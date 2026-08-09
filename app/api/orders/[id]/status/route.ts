import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";
import { z } from "zod";

const statusUpdateSchema = z.object({
  status: z.enum(["delivering", "delivered", "failed"]),
  failure_reason: z.string().optional(),
  proof_image_url: z.string().min(1).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    await requireUser();
    const supabase = await createClient();

    const body = await request.json();
    const validated = statusUpdateSchema.safeParse(body);
    
    if (!validated.success) {
      return jsonError("Dữ liệu không hợp lệ", "VALIDATION_ERROR", 400);
    }

    const { data, error } = await supabase.rpc("update_order_delivery_status", {
      p_order_id: orderId,
      p_new_status: validated.data.status,
      p_failure_reason: validated.data.failure_reason || null,
      p_proof_image_url: validated.data.proof_image_url || null,
    });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: data,
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
