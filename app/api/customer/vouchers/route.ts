import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { formatErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const { user } = await requireUser();
    const supabase = await createClient();
    const [voucherRes, redemptionsRes, pointsRes] = await Promise.all([
      supabase.from("vouchers").select("id,name,description,points_required,discount_type,discount_value,quantity,expiry_date,is_active,shop_id").eq("is_active", true).gt("quantity", 0).gte("expiry_date", new Date().toISOString().slice(0, 10)).order("points_required"),
      supabase.from("voucher_redemptions").select("id,voucher_id,points_spent,redemption_code,status,qr_expires_at,redeemed_at,used_at,vouchers(id,name,description,discount_type,discount_value,expiry_date)").eq("customer_id", user.id).order("redeemed_at", { ascending: false }),
      supabase.from("green_point_transactions").select("points_delta").eq("customer_id", user.id),
    ]);
    if (voucherRes.error) throw voucherRes.error;
    if (redemptionsRes.error) throw redemptionsRes.error;
    if (pointsRes.error) throw pointsRes.error;
    const balance = (pointsRes.data || []).reduce((sum, row) => sum + Number(row.points_delta || 0), 0);
    return NextResponse.json({ success: true, data: { balance, catalog: voucherRes.data || [], redemptions: redemptionsRes.data || [] } });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
