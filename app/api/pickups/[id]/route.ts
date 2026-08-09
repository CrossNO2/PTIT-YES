import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { formatErrorResponse, jsonError } from "@/lib/errors";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase.from("packaging_pickups").select("*").eq("id", id).eq("customer_id", user.id).maybeSingle();
    if (error) throw error;
    if (!data) return jsonError("Không tìm thấy yêu cầu thu gom", "PICKUP_NOT_FOUND", 404);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
