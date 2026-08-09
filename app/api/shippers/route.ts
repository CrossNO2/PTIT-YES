import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireShopMembership } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";
import { z } from "zod";

const addSchema = z.object({ shop_id: z.string().uuid(), email: z.string().email() });

export async function GET(request: NextRequest) {
  try {
    const shopId = new URL(request.url).searchParams.get("shop_id");
    if (!shopId) return jsonError("shop_id parameter is required", "MISSING_SHOP_ID", 400);
    await requireShopMembership(shopId);
    const supabase = await createClient();
    const { data, error } = await supabase.from("shop_members").select("*, profiles(id,name,phone,email,is_active)").eq("shop_id", shopId).eq("member_role", "shipper").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error: unknown) { const { status, body } = formatErrorResponse(error); return NextResponse.json(body, { status }); }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = addSchema.safeParse(await request.json());
    if (!parsed.success) return jsonError("Email hoặc shop không hợp lệ", "INVALID_INPUT", 400, parsed.error.flatten());
    const { shop_id, email } = parsed.data;
    await requireShopMembership(shop_id, ["owner", "admin"]);

    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin.from("profiles").select("id,email,is_active").ilike("email", email.trim()).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return jsonError("Tài khoản chưa tồn tại. Hãy để shipper đăng ký tài khoản trước, sau đó thêm lại bằng email.", "PROFILE_NOT_FOUND", 404);
    if (!profile.is_active) return jsonError("Tài khoản này đang bị vô hiệu hóa", "ACCOUNT_DISABLED", 409);

    const { error: typeError } = await admin.from("profiles").update({ account_type: "shop_user" }).eq("id", profile.id);
    if (typeError) throw typeError;
    const { data: member, error: memberError } = await admin.from("shop_members").upsert({ shop_id, user_id: profile.id, member_role: "shipper", status: "active" }, { onConflict: "shop_id,user_id" }).select("*, profiles(id,name,phone,email,is_active)").single();
    if (memberError) throw memberError;
    return NextResponse.json({ success: true, data: member });
  } catch (error: unknown) { const { status, body } = formatErrorResponse(error); return NextResponse.json(body, { status }); }
}
