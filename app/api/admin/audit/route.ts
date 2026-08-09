import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireShopMembership } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shop_id");
    if (!shopId) return jsonError("shop_id parameter is required", "MISSING_SHOP_ID", 400);

    await requireShopMembership(shopId, ["owner", "admin"]);
    const supabase = await createClient();

    const { data: logs, error } = await supabase
      .from("order_access_logs")
      .select("id,order_id,accessed_by,action,reason,ip_address,created_at,profiles!accessed_by(name,email),orders!inner(order_code,shop_id)")
      .eq("orders.shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;

    return NextResponse.json({ success: true, data: logs ?? [] });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
