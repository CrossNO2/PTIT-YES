import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";

import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const { user, profile } = await requireUser();

    // Rate Limiting on unmask endpoint (10 requests per minute per user)
    const rateLimit = await checkRateLimit("order_unmask", { max: 10, windowMs: 60000 });
    if (!rateLimit.success) {
      return jsonError("RATE_LIMIT_EXCEEDED: Quá nhiều yêu cầu xem SĐT trong thời gian ngắn", "RATE_LIMIT_EXCEEDED", 429);
    }

    const supabase = await createClient();
    
    // We need service_role here because shipper's direct SELECT on orders is revoked by RLS
    const { createClient: createSupabaseClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const adminSupabase = createSupabaseClient(supabaseUrl, supabaseServiceKey);

    const body = await request.json().catch(() => ({}));
    const reason = body.reason || "Shipper calling customer for delivery";

    // 1. Fetch Order
    const { data: order, error: ordError } = await adminSupabase
      .from("orders")
      .select("*, routes!assigned_route_id(*)")
      .eq("id", orderId)
      .single();

    if (ordError || !order) {
      return jsonError(`Đơn hàng ${orderId} không tồn tại`, "NOT_FOUND", 404);
    }

    // 2. Security Check: Order MUST be in 'delivering' status
    if (order.status !== "delivering") {
      return jsonError(
        "FORBIDDEN: Bạn chỉ có thể xem thông tin liên hệ đầy đủ khi đơn hàng ở trạng thái 'Đang Giao' (delivering)",
        "ORDER_NOT_DELIVERING",
        403
      );
    }

    // 3. Security Check: Shipper assignment
    const isAssignedShipper = order.assigned_shipper_id === user.id;

    if (!isAssignedShipper && profile.account_type !== "platform_admin") {
      // Check if user is shop admin
      const { data: member } = await supabase
        .from("shop_members")
        .select("member_role")
        .eq("shop_id", order.shop_id)
        .eq("user_id", user.id)
        .single();

      if (!member || !["owner", "admin"].includes(member.member_role)) {
        return jsonError("FORBIDDEN: Bạn không được gán cho đơn hàng này", "FORBIDDEN", 403);
      }
    }

    // 4. Audit Log Access
    const ipAddress = request.headers.get("x-forwarded-for") || "127.0.0.1";

    await adminSupabase.from("order_access_logs").insert({
      order_id: orderId,
      accessed_by: user.id,
      action: "UNMASK_CUSTOMER_INFO",
      reason,
      ip_address: ipAddress,
    });

    // 5. Return UNMASKED sensitive data
    return NextResponse.json({
      success: true,
      data: {
        orderId,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        unmaskedAt: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
