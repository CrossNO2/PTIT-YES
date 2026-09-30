import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { formatErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const { user } = await requireUser();
    const supabase = await createClient();
    const [recoveriesRes, pickupsRes, txRes, voucherRes] = await Promise.all([
      supabase
        .from("recovery_requests")
        .select("id, status, pickup_date, pickup_address, completed_at, picked_up_at, created_at, paas_bags(bag_code)")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("packaging_pickups")
        .select("id, packaging_type, estimated_quantity_kg, verified_quantity_kg, status, pickup_date, completed_at, created_at")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("green_point_transactions")
        .select("id, points_delta, transaction_type, description, created_at, packaging_pickup_id, voucher_redemption_id")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("voucher_redemptions")
        .select("id, points_spent, status, redemption_code, redeemed_at, used_at, created_at, vouchers(name)")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    if (recoveriesRes.error) throw recoveriesRes.error;
    if (pickupsRes.error) throw pickupsRes.error;
    if (txRes.error) throw txRes.error;
    if (voucherRes.error) throw voucherRes.error;

    const items = [
      ...(recoveriesRes.data || []).map((r) => {
        const bag = Array.isArray(r.paas_bags) ? r.paas_bags[0] : (r.paas_bags as { bag_code?: string } | null);
        const bagCode = bag?.bag_code ? `#${bag.bag_code}` : "PaaS";
        return {
          id: `recovery-${r.id}`,
          source_id: r.id,
          kind: "pickup",
          title: `Thu hồi túi ${bagCode}`,
          description: `${r.pickup_address} · Hẹn: ${r.pickup_date || "Chờ xếp lịch"}`,
          status: r.status,
          occurred_at: r.completed_at || r.picked_up_at || r.created_at,
          points_delta: null,
        };
      }),
      ...(pickupsRes.data || []).map((p) => ({
        id: `pickup-${p.id}`, source_id: p.id, kind: "pickup", title: "Thu gom bao bì",
        description: `${p.packaging_type} · ${Number(p.verified_quantity_kg || p.estimated_quantity_kg || 0).toFixed(1)} kg`,
        status: p.status, occurred_at: p.completed_at || p.created_at, points_delta: null,
      })),
      ...(txRes.data || []).map((t) => ({
        id: `points-${t.id}`, source_id: t.id, kind: "points", title: t.points_delta >= 0 ? "Cộng Green Points" : "Trừ Green Points",
        description: t.description, status: "ledger", occurred_at: t.created_at, points_delta: t.points_delta,
      })),
      ...(voucherRes.data || []).map((v) => ({
        id: `voucher-${v.id}`, source_id: v.id, kind: "voucher", title: "Đổi voucher",
        description: Array.isArray(v.vouchers) ? v.vouchers[0]?.name || "Voucher GreenBridge" : (v.vouchers as { name?: string } | null)?.name || "Voucher GreenBridge",
        status: v.status, occurred_at: v.used_at || v.redeemed_at || v.created_at, points_delta: -Math.abs(v.points_spent || 0),
      })),
    ].sort((a, b) => new Date(b.occurred_at || 0).getTime() - new Date(a.occurred_at || 0).getTime());

    return NextResponse.json({ success: true, data: items });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
