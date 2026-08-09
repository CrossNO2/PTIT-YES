import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireShopMembership } from "@/lib/auth/require-user";
import { orderCreateSchema } from "@/lib/validation/schemas";
import { maskOrderCustomerInfo } from "@/lib/masking";
import { formatErrorResponse, jsonError } from "@/lib/errors";
import { randomBytes } from "crypto";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireUser();
    const supabase = await createClient();

    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get("shop_id");
    const status = searchParams.get("status");
    const deliveryDate = searchParams.get("delivery_date");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    if (!shopId) {
      return jsonError("shop_id parameter is required", "MISSING_SHOP_ID", 400);
    }

    await requireShopMembership(shopId);

    let query = supabase
      .from("orders")
      .select("*", { count: "exact" })
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (deliveryDate) {
      query = query.eq("delivery_date", deliveryDate);
    }

    if (search) {
      query = query.or(`order_code.ilike.%${search}%,customer_name.ilike.%${search}%,address.ilike.%${search}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: orders, count, error } = await query;

    if (error) {
      throw error;
    }

    // Mask customer information by default across all listing APIs
    const maskedOrders = (orders || []).map((order) => maskOrderCustomerInfo(order));

    return NextResponse.json({
      success: true,
      data: maskedOrders,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = orderCreateSchema.safeParse(body);

    if (!validated.success) {
      return jsonError("Input đơn hàng không hợp lệ", "INVALID_INPUT", 400, validated.error.flatten());
    }

    const data = validated.data;
    await requireShopMembership(data.shop_id, ["owner", "admin", "dispatcher"]);

    const supabase = await createClient();

    // Auto generate unique order_code if not provided
    const orderCode = `ORD-${new Date().toISOString().slice(2,10).replace(/-/g, "")}-${randomBytes(3).toString("hex").toUpperCase()}`;

    const { data: newOrder, error } = await supabase
      .from("orders")
      .insert({
        shop_id: data.shop_id,
        order_code: orderCode,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        address: data.address,
        lat: data.lat,
        lng: data.lng,
        delivery_date: data.delivery_date,
        time_slot_start: data.time_slot_start,
        time_slot_end: data.time_slot_end,
        weight_kg: data.weight_kg,
        priority: data.priority,
        notes: data.notes || null,
        status: "ready",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: maskOrderCustomerInfo(newOrder),
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
