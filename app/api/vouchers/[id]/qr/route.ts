import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { formatErrorResponse } from "@/lib/errors";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("rotate_voucher_qr", { p_redemption_id: id });
    if (error) throw error;
    return NextResponse.json({ success: true, data: { qrToken: data.raw_qr_token, qr_expires_at: data.qr_expires_at, redemption_code: data.redemption_code } });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
