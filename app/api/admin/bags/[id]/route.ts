import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireHubOperator } from "@/lib/auth/require-hub-operator";
import { formatErrorResponse, jsonError } from "@/lib/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return jsonError("ID túi không hợp lệ", "INVALID_BAG_ID", 400);
    }

    // Server-side authorization: requires hub operator or admin
    await requireHubOperator();
    const supabase = await createClient();

    // 1. Fetch bag master details
    const { data: bag, error: bagError } = await supabase
      .from("paas_bags")
      .select(`
        id,
        bag_code,
        qr_code_hash,
        owner_entity,
        is_platform_owned,
        current_shop_id,
        current_holder_type,
        current_holder_user_id,
        current_location_type,
        current_warehouse_id,
        current_pudo_id,
        model_type,
        size_category,
        status,
        condition,
        usage_count,
        max_cycles,
        manufacture_date,
        last_inspected_at,
        last_cleaned_at,
        created_at,
        updated_at,
        warehouses:current_warehouse_id (
          id,
          name,
          address
        ),
        shops:current_shop_id (
          id,
          name
        ),
        holder_profile:current_holder_user_id (
          id,
          name,
          phone
        )
      `)
      .eq("id", id)
      .maybeSingle();

    if (bagError || !bag) {
      return jsonError("Không tìm thấy thông tin túi PaaS", "BAG_NOT_FOUND", 404);
    }

    // 2. Fetch immutable lifecycle events from bag_lifecycle_events
    const { data: events, error: eventsError } = await supabase
      .from("bag_lifecycle_events")
      .select(`
        id,
        bag_id,
        from_status,
        to_status,
        event_type,
        actor_id,
        order_id,
        recovery_request_id,
        route_id,
        location_notes,
        metadata,
        created_at,
        actor:actor_id (
          id,
          name,
          account_type
        )
      `)
      .eq("bag_id", id)
      .order("created_at", { ascending: true });

    if (eventsError) {
      throw eventsError;
    }

    return NextResponse.json({
      success: true,
      data: {
        bag,
        lifecycle_events: events || [],
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
