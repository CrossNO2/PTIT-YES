import { NextRequest, NextResponse } from "next/server";
import { requireShopMembership } from "@/lib/auth/require-user";
import { generateEsgPdfReport } from "@/lib/reports/pdf";
import { formatErrorResponse, jsonError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shop_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    if (!shopId) {
      return jsonError("shop_id is required", "MISSING_SHOP_ID", 400);
    }

    await requireShopMembership(shopId);

    const supabase = await createClient();

    // Fetch Shop Info
    const { data: shop } = await supabase
      .from("shops")
      .select("name")
      .eq("id", shopId)
      .single();

    // Fetch ESG Reports
    let query = supabase
      .from("esg_reports")
      .select("km_saved, co2_saved_kg, packaging_collected_kg, cost_saved_vnd")
      .eq("shop_id", shopId);

    if (startDate) query = query.gte("report_date", startDate);
    if (endDate) query = query.lte("report_date", endDate);

    const { data: reports, error: rErr } = await query;

    if (rErr) throw rErr;

    // Aggregate Data
    const totalKmSaved = reports?.reduce((acc, r) => acc + Number(r.km_saved || 0), 0) || 0;
    const totalCo2SavedKg = reports?.reduce((acc, r) => acc + Number(r.co2_saved_kg || 0), 0) || 0;
    const totalPackagingCollectedKg = reports?.reduce((acc, r) => acc + Number(r.packaging_collected_kg || 0), 0) || 0;
    const totalCostSavedVnd = reports?.reduce((acc, r) => acc + Number(r.cost_saved_vnd || 0), 0) || 0;
    const routeCount = reports?.length || 0;

    const pdfBuffer = generateEsgPdfReport({
      shopName: shop?.name || "GreenBridge Logistics",
      reportDate: new Date().toISOString().split("T")[0],
      totalKmSaved,
      totalCo2SavedKg,
      totalPackagingCollectedKg,
      totalCostSavedVnd,
      routeCount,
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="GreenBridge_ESG_Report_${new Date().toISOString().split("T")[0]}.pdf"`,
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
