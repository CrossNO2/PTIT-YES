import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const { user } = await requireUser();
    const supabase = await createClient();

    // 1. Query point transactions ledger
    const { data: transactions, error: txError } = await supabase
      .from("green_point_transactions")
      .select("*")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (txError) {
      throw txError;
    }

    // 2. Compute total point balance
    const totalPoints = (transactions || []).reduce((acc, t) => acc + (t.points_delta || 0), 0);

    return NextResponse.json({
      success: true,
      data: {
        total_points: totalPoints,
        transactions: transactions || [],
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
