import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireUser();
    const { id } = await params;
    const supabase = await createClient();

    const { data: recovery, error } = await supabase
      .from("recovery_requests")
      .select(`
        id,
        bag_id,
        order_id,
        status,
        recovery_strategy,
        pickup_address,
        lat,
        lng,
        pickup_date,
        time_slot_start,
        time_slot_end,
        assigned_route_id,
        assigned_shipper_id,
        picked_up_at,
        completed_at,
        failure_reason,
        notes,
        created_at,
        updated_at,
        paas_bags (
          id,
          bag_code,
          qr_code_hash,
          model_type,
          status,
          condition,
          usage_count,
          max_cycles
        ),
        recovery_decisions (
          id,
          recommended_strategy,
          selected_strategy,
          estimated_distance_delta_km,
          estimated_duration_delta_mins,
          estimated_cost_delta_vnd,
          context_signals_snapshot,
          rationale,
          decision_source,
          created_at
        ),
        orders (
          id,
          order_code,
          delivery_date
        )
      `)
      .eq("id", id)
      .eq("customer_id", user.id)
      .maybeSingle();

    if (error || !recovery) {
      return jsonError("Không tìm thấy yêu cầu thu gom hoặc bạn không có quyền xem", "RECOVERY_NOT_FOUND", 404);
    }

    const decision = (recovery.recovery_decisions as any[])?.[0] || null;

    return NextResponse.json({
      success: true,
      data: {
        id: recovery.id,
        bag_id: recovery.bag_id,
        bag: recovery.paas_bags,
        order_id: recovery.order_id,
        order: recovery.orders,
        status: recovery.status,
        recovery_strategy: recovery.recovery_strategy,
        pickup_address: recovery.pickup_address,
        lat: recovery.lat,
        lng: recovery.lng,
        pickup_date: recovery.pickup_date,
        time_slot_start: recovery.time_slot_start,
        time_slot_end: recovery.time_slot_end,
        assigned_route_id: recovery.assigned_route_id,
        assigned_shipper_id: recovery.assigned_shipper_id,
        picked_up_at: recovery.picked_up_at,
        completed_at: recovery.completed_at,
        failure_reason: recovery.failure_reason,
        notes: recovery.notes,
        created_at: recovery.created_at,
        updated_at: recovery.updated_at,
        decision: decision
          ? {
              id: decision.id,
              selected_strategy: decision.selected_strategy,
              recommended_strategy: decision.recommended_strategy,
              decision_source: decision.decision_source,
              estimated_distance_delta_km: decision.estimated_distance_delta_km,
              estimated_duration_delta_mins: decision.estimated_duration_delta_mins,
              estimated_cost_delta_vnd: decision.estimated_cost_delta_vnd,
              rationale: decision.rationale,
              context_signals: decision.context_signals_snapshot,
              created_at: decision.created_at,
            }
          : null,
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
