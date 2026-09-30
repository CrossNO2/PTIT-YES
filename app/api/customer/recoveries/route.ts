import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";
import { evaluateRecoveryDecision, ContextSignalSnapshot } from "@/lib/lifecycle/recovery-engine";
import { RecoveryRequest } from "@/types/database";
import { z } from "zod";

const createRecoverySchema = z.object({
  bag_id: z.string().uuid("ID túi không hợp lệ"),
  pickup_address: z.string().min(5, "Địa chỉ thu gom phải từ 5 ký tự trở lên").max(300, "Địa chỉ quá dài"),
  pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày thu gom không đúng định dạng YYYY-MM-DD"),
  time_slot_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Khung giờ bắt đầu không hợp lệ (HH:MM)").optional().default("08:00"),
  time_slot_end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Khung giờ kết thúc không hợp lệ (HH:MM)").optional().default("18:00"),
  notes: z.string().max(500, "Ghi chú không được quá 500 ký tự").optional().default(""),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

function validateTimeWindow(pickupDateStr: string, startTimeStr: string, endTimeStr: string) {
  // 1. Validate Date: must be between today and today + 30 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 30);

  const pickupDate = new Date(`${pickupDateStr}T00:00:00`);
  if (isNaN(pickupDate.getTime())) {
    throw new Error("Ngày thu gom không hợp lệ");
  }

  if (pickupDate < today) {
    throw new Error("Ngày thu gom không thể là ngày trong quá khứ");
  }

  if (pickupDate > maxDate) {
    throw new Error("Ngày thu gom không thể vượt quá 30 ngày tới");
  }

  // 2. Validate Time Slot: operational hours (06:00 to 22:00)
  const [startH, startM] = startTimeStr.split(":").map(Number);
  const [endH, endM] = endTimeStr.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes < 6 * 60 || endMinutes > 22 * 60) {
    throw new Error("Khung giờ thu gom phải nằm trong khoảng hoạt động từ 06:00 đến 22:00");
  }

  if (endMinutes <= startMinutes) {
    throw new Error("Khung giờ kết thúc phải sau khung giờ bắt đầu");
  }

  if (endMinutes - startMinutes < 30) {
    throw new Error("Khoảng thời gian thu gom tối thiểu là 30 phút");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireUser();
    const supabase = await createClient();

    const body = await request.json();
    const validated = createRecoverySchema.parse(body);

    // Validate Time Window & Date Restrictions
    try {
      validateTimeWindow(validated.pickup_date, validated.time_slot_start, validated.time_slot_end);
    } catch (valErr) {
      return jsonError((valErr as Error).message, "INVALID_TIME_WINDOW", 400);
    }

    // 1. Verify Bag Custody & Eligibility
    const { data: bag, error: bagError } = await supabase
      .from("paas_bags")
      .select("id, bag_code, qr_code_hash, status, current_holder_type, current_holder_user_id, current_shop_id, usage_count")
      .eq("id", validated.bag_id)
      .maybeSingle();

    if (bagError || !bag) {
      return jsonError("Không tìm thấy túi PaaS yêu cầu", "BAG_NOT_FOUND", 404);
    }

    // Security check: Only the customer who currently holds physical custody of the bag can request recovery
    if (bag.current_holder_user_id !== user.id || bag.current_holder_type !== "customer") {
      return jsonError("Bạn không có quyền yêu cầu thu gom cho túi này", "BAG_NOT_OWNED", 403);
    }

    // 2. Authoritative Location Derivation
    // In GreenBridge PaaS, every bag in customer custody was delivered via an order.
    // The trusted order delivery coordinates represent the authoritative location.
    // Untrusted client coordinates MUST NOT override order location or manipulate route feasibility!
    const { data: activeAssignment } = await supabase
      .from("order_bag_assignments")
      .select("order_id, orders(id, address, lat, lng)")
      .eq("bag_id", validated.bag_id)
      .eq("is_active", true)
      .maybeSingle();

    const orderData = (activeAssignment as any)?.orders;

    if (
      !orderData ||
      orderData.lat == null ||
      orderData.lng == null ||
      isNaN(Number(orderData.lat)) ||
      isNaN(Number(orderData.lng))
    ) {
      return jsonError(
        "Tọa độ đơn hàng gốc không khả dụng để tính toán thu hồi",
        "RECOVERY_LOCATION_UNAVAILABLE",
        400
      );
    }

    const lat = Number(orderData.lat);
    const lng = Number(orderData.lng);
    const pickupAddress = validated.pickup_address || orderData.address;

    // 3. Idempotency Check & Incomplete State Recovery
    const { data: activeRecovery } = await supabase
      .from("recovery_requests")
      .select(`
        id,
        shop_id,
        customer_id,
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
        created_at,
        updated_at,
        recovery_decisions (
          id,
          recommended_strategy,
          selected_strategy,
          estimated_distance_delta_km,
          estimated_duration_delta_mins,
          estimated_cost_delta_vnd,
          rationale,
          context_signals_snapshot
        )
      `)
      .eq("bag_id", validated.bag_id)
      .in("status", ["requested", "planned", "assigned", "in_transit"])
      .maybeSingle();

    if (activeRecovery) {
      const existingDecisions = (activeRecovery.recovery_decisions as any[]) || [];
      const decision = existingDecisions[0] || null;

      // CASE 3A: Active recovery ALREADY has a completed decision -> Return safe idempotent response
      if (decision) {
        return NextResponse.json({
          success: true,
          is_existing: true,
          message: "Yêu cầu thu gom cho túi này đã tồn tại và đã được phân tích tuyến",
          data: {
            recovery_request_id: activeRecovery.id,
            bag_id: activeRecovery.bag_id,
            bag_code: bag.bag_code,
            order_id: activeRecovery.order_id,
            status: activeRecovery.status,
            decision_id: decision.id,
            selected_strategy: decision.selected_strategy || activeRecovery.recovery_strategy,
            decision_status: activeRecovery.status,
            rationale: decision.rationale || null,
            estimated_distance: decision.estimated_distance_delta_km || 0,
            estimated_duration: decision.estimated_duration_delta_mins || 0,
            pickup_address: activeRecovery.pickup_address,
            pickup_date: activeRecovery.pickup_date,
            created_at: activeRecovery.created_at,
          },
        });
      }

      // CASE 3B: Incomplete state recovery -> request exists but decision was missing!
      // Resume decision evaluation & persistence for this active recovery instead of creating duplicate!
      const shopId = bag.current_shop_id;
      const { data: routesData } = await supabase
        .from("routes")
        .select(`
          *,
          stops:route_stops (id, sequence_index, lat, lng, stop_type),
          vehicles (id, bag_capacity_units, capacity_kg, fuel_cost_vnd_per_km)
        `)
        .eq("shop_id", shopId)
        .eq("route_date", activeRecovery.pickup_date)
        .in("status", ["assigned", "draft", "in_progress"]);

      const { data: warehouse } = await supabase
        .from("warehouses")
        .select("*")
        .eq("shop_id", shopId)
        .eq("is_default", true)
        .maybeSingle();

      const candidateRoutes = (routesData || []).map((r: any) => ({
        ...r,
        stops: (r.stops || []).map((s: any) => ({
          lat: Number(s.lat),
          lng: Number(s.lng),
          sequence_index: s.sequence_index,
          stop_type: s.stop_type,
        })),
        vehicle: r.vehicles || null,
      }));

      const contextSignals: ContextSignalSnapshot = {
        source: "SIMULATED",
        weatherCondition: "CLEAR",
        trafficLevel: "medium",
        floodRiskLevel: "none",
        severityLevel: "low",
        capturedAt: new Date().toISOString(),
      };

      let decisionResult;
      try {
        decisionResult = evaluateRecoveryDecision({
          recoveryRequest: activeRecovery as unknown as RecoveryRequest,
          candidateRoutes,
          warehouse,
          vehicle: candidateRoutes[0]?.vehicle || null,
          contextSignals,
        });
      } catch (engineErr) {
        return jsonError(
          `Không thể phân tích quyết định thu gom: ${(engineErr as Error).message}`,
          "DECISION_EVALUATION_FAILED",
          500
        );
      }

      const { data: persistRes, error: persistError } = await supabase.rpc(
        "evaluate_and_persist_recovery_decision_v2",
        {
          p_recovery_request_id: activeRecovery.id,
          p_recommended_strategy: decisionResult.recommended_strategy,
          p_selected_strategy: decisionResult.selected_strategy,
          p_distance_delta: decisionResult.estimated_distance_delta_km,
          p_duration_delta: decisionResult.estimated_duration_delta_mins,
          p_cost_delta: decisionResult.estimated_cost_delta_vnd,
          p_target_route_id: decisionResult.target_route_id,
          p_context_signals: decisionResult.context_signals_snapshot,
          p_rationale: decisionResult.rationale,
          p_decision_source: decisionResult.decision_source,
        }
      );

      if (persistError) {
        return jsonError(
          `Không thể lưu quyết định thu gom: ${persistError.message}`,
          "DECISION_PERSISTENCE_FAILED",
          500
        );
      }

      return NextResponse.json({
        success: true,
        is_recovered: true,
        message: "Đã hoàn tất phân tích quyết định thu gom cho yêu cầu hiện tại",
        data: {
          recovery_request_id: activeRecovery.id,
          bag_id: bag.id,
          bag_code: bag.bag_code,
          order_id: activeRecovery.order_id,
          decision_id: persistRes?.decision_id || null,
          selected_strategy: decisionResult.selected_strategy,
          decision_status: decisionResult.is_strategy_a ? "assigned" : "planned",
          rationale: decisionResult.rationale,
          estimated_distance: decisionResult.estimated_distance_delta_km,
          estimated_duration: decisionResult.estimated_duration_delta_mins,
          dedicated_task: decisionResult.dedicated_task,
          pickup_address: activeRecovery.pickup_address,
          pickup_date: activeRecovery.pickup_date,
          created_at: activeRecovery.created_at,
        },
      });
    }

    // 4. Lifecycle Transition Enforcement:
    // If no active recovery, bag MUST be in 'with_customer' to initiate recovery
    if (bag.status !== "with_customer") {
      return jsonError(
        `Túi hiện đang ở trạng thái '${bag.status}', không thể yêu cầu thu gom`,
        "INVALID_LIFECYCLE_STATE",
        400
      );
    }

    // 5. Call GB-002 RPC to create recovery request and transition bag:
    // with_customer -> return_requested
    // Enforces concurrency serialization via SELECT ... FOR UPDATE on paas_bags in SQL
    const { data: rpcRes, error: rpcError } = await supabase.rpc("request_bag_recovery", {
      p_bag_id: validated.bag_id,
      p_pickup_address: pickupAddress,
      p_lat: lat,
      p_lng: lng,
      p_pickup_date: validated.pickup_date,
      p_time_slot_start: validated.time_slot_start,
      p_time_slot_end: validated.time_slot_end,
      p_notes: validated.notes,
    });

    if (rpcError || !rpcRes?.recovery_request_id) {
      // Concurrency check: If another concurrent request just created the recovery, safely return it
      if (
        rpcError?.message?.includes("DUPLICATE_ACTIVE_RECOVERY_REQUEST") ||
        rpcError?.message?.includes("INVALID_BAG_STATE")
      ) {
        const { data: raceRecovery } = await supabase
          .from("recovery_requests")
          .select("*, recovery_decisions(*)")
          .eq("bag_id", validated.bag_id)
          .in("status", ["requested", "planned", "assigned", "in_transit"])
          .maybeSingle();

        if (raceRecovery) {
          const raceDecision = (raceRecovery.recovery_decisions as any[])?.[0] || null;
          return NextResponse.json({
            success: true,
            is_existing: true,
            message: "Yêu cầu thu gom cho túi này đã được tạo đồng thời bởi một phiên khác",
            data: {
              recovery_request_id: raceRecovery.id,
              bag_id: raceRecovery.bag_id,
              bag_code: bag.bag_code,
              order_id: raceRecovery.order_id,
              status: raceRecovery.status,
              decision_id: raceDecision?.id || null,
              selected_strategy: raceDecision?.selected_strategy || raceRecovery.recovery_strategy,
              decision_status: raceRecovery.status,
              rationale: raceDecision?.rationale || null,
              pickup_address: raceRecovery.pickup_address,
              pickup_date: raceRecovery.pickup_date,
              created_at: raceRecovery.created_at,
            },
          });
        }
      }

      return jsonError(
        rpcError?.message || "Không thể tạo yêu cầu thu gom từ CSDL",
        "RECOVERY_CREATION_FAILED",
        500
      );
    }

    const recoveryRequestId = rpcRes.recovery_request_id;

    // 6. Fetch Candidate Delivery Routes for Decision Engine (GB-003)
    const { data: fullRecovery } = await supabase
      .from("recovery_requests")
      .select("*")
      .eq("id", recoveryRequestId)
      .single();

    const shopId = fullRecovery?.shop_id || bag.current_shop_id;

    const { data: routesData } = await supabase
      .from("routes")
      .select(`
        *,
        stops:route_stops (
          id,
          sequence_index,
          lat,
          lng,
          stop_type
        ),
        vehicles (
          id,
          bag_capacity_units,
          capacity_kg,
          fuel_cost_vnd_per_km
        )
      `)
      .eq("shop_id", shopId)
      .eq("route_date", validated.pickup_date)
      .in("status", ["assigned", "draft", "in_progress"]);

    const { data: warehouse } = await supabase
      .from("warehouses")
      .select("*")
      .eq("shop_id", shopId)
      .eq("is_default", true)
      .maybeSingle();

    // 7. Gather Simulated Environmental Context Signals (GB-003)
    const contextSignals: ContextSignalSnapshot = {
      source: "SIMULATED",
      weatherCondition: "CLEAR",
      trafficLevel: "medium",
      floodRiskLevel: "none",
      severityLevel: "low",
      capturedAt: new Date().toISOString(),
    };

    const candidateRoutes = (routesData || []).map((r: any) => ({
      ...r,
      stops: (r.stops || []).map((s: any) => ({
        lat: Number(s.lat),
        lng: Number(s.lng),
        sequence_index: s.sequence_index,
        stop_type: s.stop_type,
      })),
      vehicle: r.vehicles || null,
    }));

    // 8. Invoke GB-003 Decision Engine
    // Preserves distinct semantics:
    // - CASE A: Candidates evaluated, none viable -> Strategy C with explainability
    // - CASE B: Runtime/engine error -> DECISION_EVALUATION_FAILED (never silently converted to Strategy C)
    let decisionResult;
    try {
      decisionResult = evaluateRecoveryDecision({
        recoveryRequest: fullRecovery as RecoveryRequest,
        candidateRoutes,
        warehouse,
        vehicle: candidateRoutes[0]?.vehicle || null,
        contextSignals,
      });
    } catch (engineErr) {
      return jsonError(
        `Không thể phân tích quyết định thu gom: ${(engineErr as Error).message}`,
        "DECISION_EVALUATION_FAILED",
        500
      );
    }

    // 9. Atomically Persist Explainable Decision (GB-003 RPC)
    const { data: persistRes, error: persistError } = await supabase.rpc(
      "evaluate_and_persist_recovery_decision_v2",
      {
        p_recovery_request_id: recoveryRequestId,
        p_recommended_strategy: decisionResult.recommended_strategy,
        p_selected_strategy: decisionResult.selected_strategy,
        p_distance_delta: decisionResult.estimated_distance_delta_km,
        p_duration_delta: decisionResult.estimated_duration_delta_mins,
        p_cost_delta: decisionResult.estimated_cost_delta_vnd,
        p_target_route_id: decisionResult.target_route_id,
        p_context_signals: decisionResult.context_signals_snapshot,
        p_rationale: decisionResult.rationale,
        p_decision_source: decisionResult.decision_source,
      }
    );

    if (persistError) {
      return jsonError(
        `Không thể lưu quyết định thu gom: ${persistError.message}`,
        "DECISION_PERSISTENCE_FAILED",
        500
      );
    }

    const decisionId = persistRes?.decision_id || rpcRes?.decision_id || null;

    return NextResponse.json({
      success: true,
      data: {
        recovery_request_id: recoveryRequestId,
        bag_id: bag.id,
        bag_code: bag.bag_code,
        order_id: fullRecovery?.order_id || null,
        decision_id: decisionId,
        selected_strategy: decisionResult.selected_strategy,
        decision_status: decisionResult.is_strategy_a ? "assigned" : "planned",
        rationale: decisionResult.rationale,
        estimated_distance: decisionResult.estimated_distance_delta_km,
        estimated_duration: decisionResult.estimated_duration_delta_mins,
        dedicated_task: decisionResult.dedicated_task,
        pickup_address: pickupAddress,
        pickup_date: validated.pickup_date,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}

export async function GET() {
  try {
    const { user } = await requireUser();
    const supabase = await createClient();

    const { data: recoveries, error } = await supabase
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
        picked_up_at,
        completed_at,
        created_at,
        paas_bags (
          id,
          bag_code,
          qr_code_hash,
          model_type,
          status,
          usage_count
        ),
        recovery_decisions (
          id,
          recommended_strategy,
          selected_strategy,
          estimated_distance_delta_km,
          estimated_duration_delta_mins,
          estimated_cost_delta_vnd,
          rationale,
          context_signals_snapshot,
          created_at
        )
      `)
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const data = (recoveries || []).map((rec: any) => {
      const decision = rec.recovery_decisions?.[0] || null;
      return {
        id: rec.id,
        bag_id: rec.bag_id,
        order_id: rec.order_id,
        status: rec.status,
        recovery_strategy: rec.recovery_strategy,
        pickup_address: rec.pickup_address,
        pickup_date: rec.pickup_date,
        time_slot: `${(rec.time_slot_start || "08:00").slice(0, 5)} - ${(rec.time_slot_end || "18:00").slice(0, 5)}`,
        assigned_route_id: rec.assigned_route_id,
        picked_up_at: rec.picked_up_at,
        completed_at: rec.completed_at,
        created_at: rec.created_at,
        bag: rec.paas_bags,
        decision: decision
          ? {
              id: decision.id,
              selected_strategy: decision.selected_strategy,
              estimated_distance_delta_km: decision.estimated_distance_delta_km,
              estimated_duration_delta_mins: decision.estimated_duration_delta_mins,
              rationale: decision.rationale,
            }
          : null,
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
