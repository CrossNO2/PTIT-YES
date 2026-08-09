import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireShopMembership } from "@/lib/auth/require-user";
import { ESG_DISCLAIMER } from "@/lib/esg";
import { formatErrorResponse, jsonError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shop_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    if (!shopId) {
      return jsonError("shop_id parameter is required", "MISSING_SHOP_ID", 400);
    }

    await requireShopMembership(shopId);
    const supabase = await createClient();

    let query = supabase
      .from("esg_reports")
      .select("*")
      .eq("shop_id", shopId)
      .order("report_date", { ascending: false });

    if (startDate) query = query.gte("report_date", startDate);
    if (endDate) query = query.lte("report_date", endDate);

    const { data: reports, error } = await query;
    if (error) throw error;

    const list = reports || [];

    const totalKmSaved = Number(list.reduce((acc, r) => acc + (r.km_saved || 0), 0).toFixed(2));
    const totalCo2SavedKg = Number(list.reduce((acc, r) => acc + (r.co2_saved_kg || 0), 0).toFixed(4));
    const totalPackagingCollectedKg = Number(list.reduce((acc, r) => acc + (r.packaging_collected_kg || 0), 0).toFixed(2));
    const totalCostSavedVnd = Number(list.reduce((acc, r) => acc + (r.cost_saved_vnd || 0), 0).toFixed(2));

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          totalKmSaved,
          totalCo2SavedKg,
          totalPackagingCollectedKg,
          totalCostSavedVnd,
          routeCount: list.length,
          baselineMethod: "CREATION_ORDER_V1",
          disclaimer: ESG_DISCLAIMER,
        },
        reports: list,
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
