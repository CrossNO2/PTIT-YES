import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const { user } = await requireUser();
    const supabase = await createClient();

    // 1. Fetch bags currently held by this customer
    const { data: bags, error: bagsError } = await supabase
      .from("paas_bags")
      .select(`
        id,
        bag_code,
        qr_code_hash,
        owner_entity,
        is_platform_owned,
        current_holder_type,
        current_holder_user_id,
        current_location_type,
        model_type,
        size_category,
        status,
        condition,
        usage_count,
        max_cycles,
        created_at,
        updated_at
      `)
      .eq("current_holder_user_id", user.id)
      .eq("current_holder_type", "customer")
      .order("updated_at", { ascending: false });

    if (bagsError) {
      throw bagsError;
    }

    if (!bags || bags.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    const bagIds = bags.map((b) => b.id);

    // 2. Fetch active order assignments for these bags
    const { data: assignments } = await supabase
      .from("order_bag_assignments")
      .select(`
        bag_id,
        order_id,
        is_primary,
        is_active,
        orders (
          id,
          order_code,
          delivery_date,
          status
        )
      `)
      .in("bag_id", bagIds)
      .eq("is_active", true);

    const assignmentMap = new Map<string, any>();
    for (const a of assignments || []) {
      if (a.bag_id && !assignmentMap.has(a.bag_id)) {
        assignmentMap.set(a.bag_id, a.orders);
      }
    }

    // 3. Fetch active recovery requests for these bags
    const { data: activeRecoveries } = await supabase
      .from("recovery_requests")
      .select("id, bag_id, status, recovery_strategy, pickup_date, created_at")
      .in("bag_id", bagIds)
      .in("status", ["requested", "planned", "assigned", "in_transit"]);

    const recoveryMap = new Map<string, any>();
    for (const r of activeRecoveries || []) {
      if (r.bag_id && !recoveryMap.has(r.bag_id)) {
        recoveryMap.set(r.bag_id, r);
      }
    }

    // 4. Combine data for customer response
    const data = bags.map((bag) => {
      const activeOrder = assignmentMap.get(bag.id) || null;
      const activeRecovery = recoveryMap.get(bag.id) || null;
      const canRequestRecovery = bag.status === "with_customer" && !activeRecovery;

      return {
        id: bag.id,
        bag_code: bag.bag_code,
        qr_code_hash: bag.qr_code_hash,
        model_type: bag.model_type,
        size_category: bag.size_category,
        status: bag.status,
        condition: bag.condition,
        usage_count: bag.usage_count,
        max_cycles: bag.max_cycles,
        order: activeOrder
          ? {
              id: activeOrder.id,
              order_code: activeOrder.order_code,
              delivery_date: activeOrder.delivery_date,
              status: activeOrder.status,
            }
          : null,
        active_recovery: activeRecovery
          ? {
              id: activeRecovery.id,
              status: activeRecovery.status,
              recovery_strategy: activeRecovery.recovery_strategy,
              pickup_date: activeRecovery.pickup_date,
            }
          : null,
        can_request_recovery: canRequestRecovery,
        created_at: bag.created_at,
        updated_at: bag.updated_at,
      };
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
