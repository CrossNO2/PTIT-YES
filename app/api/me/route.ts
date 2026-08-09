import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "UNAUTHENTICATED" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    const { data: shopMember } = await supabase
      .from("shop_members")
      .select("shop_id, member_role, shops(name, slug)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      data: {
        user,
        profile,
        shop_id: shopMember?.shop_id || null,
        member_role: shopMember?.member_role || null,
        shop: shopMember?.shops || null,
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
