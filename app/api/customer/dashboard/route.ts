import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const { user } = await requireUser();
    const supabase = await createClient();

    // 1. Fetch green point transactions for user
    const { data: transactions, error: txError } = await supabase
      .from("green_point_transactions")
      .select("*")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (txError) {
      throw txError;
    }

    const allTx = transactions || [];
    const totalPoints = allTx.reduce((acc, t) => acc + (t.points_delta || 0), 0);
    const pointsEarned = allTx
      .filter((t) => (t.points_delta || 0) > 0)
      .reduce((acc, t) => acc + (t.points_delta || 0), 0);

    // 2. Fetch v2 recovery requests & bags for user (PaaS Architecture)
    const { data: recoveries, error: recoveryError } = await supabase
      .from("recovery_requests")
      .select(`
        id,
        shop_id,
        customer_id,
        bag_id,
        order_id,
        status,
        recovery_strategy,
        pickup_address,
        lat,
        lng,
        pickup_date,
        time_slot_start,
        time_slot_end,
        assigned_route_id,
        assigned_shipper_id,
        picked_up_at,
        completed_at,
        created_at,
        paas_bags (
          id,
          bag_code,
          model_type,
          usage_count,
          status
        )
      `)
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (recoveryError) {
      throw recoveryError;
    }

    // Optional legacy fallback for backwards compatibility
    const { data: legacyPickups } = await supabase
      .from("packaging_pickups")
      .select("*")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    // Fetch user's active PaaS bags in custody
    const { data: bagsInCustody } = await supabase
      .from("paas_bags")
      .select("id, bag_code, status, usage_count")
      .eq("current_holder_user_id", user.id);
    const totalBagsInCustody = (bagsInCustody || []).length;

    const recoveryMapped = (recoveries || []).map((r) => {
      const bag = Array.isArray(r.paas_bags) ? r.paas_bags[0] : (r.paas_bags as { bag_code?: string } | null);
      const bagLabel = bag?.bag_code ? `Túi PaaS (${bag.bag_code})` : "Túi PaaS Reusable";
      return {
        id: r.id,
        address: r.pickup_address,
        lat: Number(r.lat),
        lng: Number(r.lng),
        status: r.status,
        packaging_type: bagLabel,
        quantity_kg: 1,
        estimated_quantity_kg: 1,
        verified_quantity_kg: r.status === "completed" ? 1 : 0,
        pickup_date: r.pickup_date,
        created_at: r.created_at,
        is_paas: true,
      };
    });

    const legacyMapped = (legacyPickups || []).map((p) => ({
      id: p.id,
      address: p.address,
      lat: Number(p.lat),
      lng: Number(p.lng),
      status: p.status,
      packaging_type: p.packaging_type,
      quantity_kg: Number(p.verified_quantity_kg || p.estimated_quantity_kg || 0),
      estimated_quantity_kg: Number(p.estimated_quantity_kg || 0),
      verified_quantity_kg: p.verified_quantity_kg ? Number(p.verified_quantity_kg) : 0,
      pickup_date: p.pickup_date,
      created_at: p.created_at,
      is_paas: false,
    }));

    const allPickups = [...recoveryMapped, ...legacyMapped];
    const totalPickupsCount = allPickups.length;
    const completedPickups = allPickups.filter((p) => p.status === "completed");
    const activePickups = allPickups.filter((p) =>
      ["pending", "scheduled", "assigned", "collecting", "requested", "planned", "in_transit", "picked_up"].includes(p.status)
    );
    const completedCount = completedPickups.length;
    const activeCount = activePickups.length;

    const totalPackagingKg = completedPickups.reduce(
      (acc, p) => acc + Number(p.verified_quantity_kg || p.estimated_quantity_kg || 0),
      0
    );

    // 3. Fetch voucher redemptions for user
    const { data: redemptions, error: redemptionsError } = await supabase
      .from("voucher_redemptions")
      .select(`
        id,
        voucher_id,
        customer_id,
        points_spent,
        redemption_code,
        status,
        redeemed_at,
        used_at,
        created_at,
        vouchers (
          id,
          name,
          description,
          discount_type,
          discount_value,
          expiry_date
        )
      `)
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    const voucherDataWarning = redemptionsError ? "Voucher data is temporarily unavailable" : null;
    const allRedemptions = redemptionsError ? [] : (redemptions || []);
    const activeVouchersCount = allRedemptions.filter((r) => r.status === "active").length;

    // 4. Calculate trend analytics from real data
    // Pickups over time (grouped by date)
    const pickupsByDateMap: Record<string, { date: string; count: number; weight_kg: number }> = {};
    allPickups.forEach((p) => {
      const dateStr = p.pickup_date || (p.created_at ? p.created_at.split("T")[0] : "");
      if (!dateStr) return;
      if (!pickupsByDateMap[dateStr]) {
        pickupsByDateMap[dateStr] = { date: dateStr, count: 0, weight_kg: 0 };
      }
      pickupsByDateMap[dateStr].count += 1;
      if (p.status === "completed") {
        pickupsByDateMap[dateStr].weight_kg += Number(p.verified_quantity_kg || p.estimated_quantity_kg || 0);
      }
    });

    const pickupTrend = Object.values(pickupsByDateMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);

    // Points over time (grouped by date)
    const pointsByDateMap: Record<string, { date: string; earned: number; redeemed: number }> = {};
    allTx.forEach((t) => {
      const dateStr = t.created_at ? t.created_at.split("T")[0] : "";
      if (!dateStr) return;
      if (!pointsByDateMap[dateStr]) {
        pointsByDateMap[dateStr] = { date: dateStr, earned: 0, redeemed: 0 };
      }
      if ((t.points_delta || 0) > 0) {
        pointsByDateMap[dateStr].earned += t.points_delta;
      } else {
        pointsByDateMap[dateStr].redeemed += Math.abs(t.points_delta);
      }
    });

    const pointsTrend = Object.values(pointsByDateMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);

    // 5. Sustainability metrics (strictly real data)
    // Illustrative estimate until GreenBridge adopts a formally documented lifecycle methodology.
    const co2FactorKgPerKg = 1.5;
    const co2SavedKg = Number((totalPackagingKg * co2FactorKgPerKg).toFixed(1));

    return NextResponse.json({
      success: true,
      data: {
        customer_id: user.id,
        user_email: user.email,
        kpis: {
          total_points: totalPoints,
          points_earned: pointsEarned,
          total_pickups: totalPickupsCount,
          completed_pickups: completedCount,
          active_pickups: activeCount,
          active_vouchers: activeVouchersCount,
          total_packaging_kg: Number(totalPackagingKg.toFixed(1)),
          co2_saved_kg: co2SavedKg,
          bags_in_custody: totalBagsInCustody,
        },
        map_pickups: allPickups.map((p) => ({
          id: p.id,
          address: p.address,
          lat: Number(p.lat),
          lng: Number(p.lng),
          status: p.status,
          packaging_type: p.packaging_type,
          quantity_kg: p.verified_quantity_kg || p.estimated_quantity_kg,
          pickup_date: p.pickup_date,
          created_at: p.created_at,
        })),
        recent_pickups: allPickups.slice(0, 5),
        recent_transactions: allTx.slice(0, 5),
        recent_vouchers: allRedemptions.slice(0, 5),
        analytics: {
          pickup_trend: pickupTrend,
          points_trend: pointsTrend,
        },
        sustainability: {
          packaging_collected_kg: Number(totalPackagingKg.toFixed(1)),
          co2_saved_kg: co2SavedKg,
          co2_methodology: {
            type: "illustrative_estimate",
            factor_kg_co2e_per_kg_packaging: co2FactorKgPerKg,
          },
          completed_actions: completedCount,
          points_earned: pointsEarned,
        },
        warnings: voucherDataWarning ? [voucherDataWarning] : [],
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
