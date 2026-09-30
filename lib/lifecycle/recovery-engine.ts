import {
  RecoveryRequest,
  RecoveryDecision,
  RecoveryStrategyType,
  Route,
  Vehicle,
  Warehouse,
  ShipperShift,
  DedicatedRecoveryTask,
} from "@/types/database";
import { haversineDistanceMeters } from "@/lib/optimization/distance-matrix";
import { OPTIMIZATION_CONFIG } from "@/lib/optimization/config";

export type { DedicatedRecoveryTask };

export type DecisionReasonCode =
  | "WITHIN_ROUTE_DETOUR_THRESHOLD"
  | "DETOUR_EXCEEDS_THRESHOLD"
  | "NO_ACTIVE_ROUTE_FOUND"
  | "SHIFT_LIMIT_EXCEEDED"
  | "CAPACITY_EXCEEDED"
  | "ENVIRONMENTAL_HAZARD_RESTRICTION";

export interface ContextSignalSnapshot {
  source: "SIMULATED" | "API" | "SYSTEM" | "OPERATOR";
  weatherCondition?: string;
  trafficLevel?: "low" | "medium" | "high" | "severe";
  floodRiskLevel?: "none" | "low" | "medium" | "high" | "critical";
  severityLevel?: "low" | "medium" | "high" | "critical";
  capturedAt: string;
}

export interface ExplainableRationale {
  strategy: string;
  selected_strategy: RecoveryStrategyType;
  reason_code: DecisionReasonCode;
  explanation: string;
  considered_route_id: string | null;
  considered_shipper_id: string | null;
  applied_thresholds: {
    max_delta_distance_km: number;
    max_delta_duration_mins: number;
    max_work_minutes?: number;
  };
  evaluated_metrics: {
    evaluated_delta_km: number;
    evaluated_delta_mins: number;
    estimated_cost_delta_vnd: number;
    insertion_stop_index?: number;
  };
  context_signals_snapshot: ContextSignalSnapshot;
  evidence: {
    feasible: boolean;
    route_id?: string | null;
    shipper_id?: string | null;
    estimated_detour_km: number;
    estimated_extra_minutes: number;
    threshold_distance_km: number;
    threshold_duration_mins: number;
    distance_source: "HAVERSINE_URBAN_ESTIMATE" | "ROAD_NETWORK_OSRM";
    dedicated_task?: DedicatedRecoveryTask | null;
    rejection_reasons?: string[];
  };
}

export interface CandidateRouteStop {
  lat: number;
  lng: number;
  sequence_index: number;
  stop_type?: string;
}

export interface CandidateRoute extends Route {
  stops?: CandidateRouteStop[];
  vehicle?: Vehicle | null;
  shift?: ShipperShift | null;
}

export interface EvaluateDecisionParams {
  recoveryRequest: RecoveryRequest;
  candidateRoutes?: CandidateRoute[] | null;
  warehouse?: Warehouse | null;
  vehicle?: Vehicle | null;
  contextSignals?: ContextSignalSnapshot;
  thresholds?: {
    maxDeltaDistanceKm?: number;
    maxDeltaDurationMins?: number;
  };
}

export interface RecoveryDecisionResult {
  recommended_strategy: RecoveryStrategyType;
  selected_strategy: RecoveryStrategyType;
  decision_source: "GALM_RULE_ENGINE" | "SIMULATED";
  estimated_distance_delta_km: number;
  estimated_duration_delta_mins: number;
  estimated_cost_delta_vnd: number;
  target_route_id: string | null;
  considered_shipper_id: string | null;
  context_signals_snapshot: ContextSignalSnapshot;
  rationale: ExplainableRationale;
  is_strategy_a: boolean;
  is_fallback: boolean;
  /**
   * GB-003 Dedicated Recovery Task Abstraction.
   * Instantiated when Strategy C is chosen as a concrete downstream execution target.
   */
  dedicated_task: DedicatedRecoveryTask | null;
}

/**
 * GB-003: Thinnest concrete Dedicated Recovery Task abstraction.
 * Produces an auditable downstream execution target when Strategy A is infeasible.
 */
export function buildDedicatedRecoveryTask(params: {
  recoveryRequest: RecoveryRequest;
  warehouse?: Warehouse | null;
  estimatedKm?: number;
  estimatedMins?: number;
  estimatedCostVnd?: number;
}): DedicatedRecoveryTask {
  const {
    recoveryRequest,
    warehouse,
    estimatedKm = 6.0,
    estimatedMins = 25,
    estimatedCostVnd = 7200,
  } = params;

  return {
    id: `task-rec-${recoveryRequest.id}`,
    recovery_request_id: recoveryRequest.id,
    shop_id: recoveryRequest.shop_id,
    customer_id: recoveryRequest.customer_id,
    bag_id: recoveryRequest.bag_id,
    pickup_address: recoveryRequest.pickup_address,
    lat: recoveryRequest.lat,
    lng: recoveryRequest.lng,
    pickup_date: recoveryRequest.pickup_date,
    time_slot_start: recoveryRequest.time_slot_start || "08:00",
    time_slot_end: recoveryRequest.time_slot_end || "18:00",
    depot_warehouse_id: warehouse?.id ?? null,
    depot_address: warehouse?.address ?? null,
    depot_lat: warehouse?.lat ?? null,
    depot_lng: warehouse?.lng ?? null,
    estimated_distance_km: estimatedKm,
    estimated_duration_mins: estimatedMins,
    estimated_cost_vnd: estimatedCostVnd,
    task_status: "pending_dispatch",
    target_route_type: "dedicated_recovery",
    assigned_route_id: null,
    assigned_shipper_id: null,
    created_at: new Date().toISOString(),
  };
}

const DEFAULT_SIMULATED_CONTEXT: ContextSignalSnapshot = {
  source: "SIMULATED",
  weatherCondition: "CLEAR",
  trafficLevel: "medium",
  floodRiskLevel: "none",
  severityLevel: "low",
  capturedAt: new Date().toISOString(),
};

/**
 * GB-003: Explainable Recovery Decision Engine
 *
 * Core Decision Logic:
 * 1. Checks environmental context signals (e.g. severe flood risk).
 *    If critical hazard exists -> rejects Strategy A -> Fallback to Strategy C (dedicated).
 * 2. Checks candidate route availability for the shop/depot.
 *    If no active routes available -> rejects Strategy A -> Fallback to Strategy C.
 * 3. Evaluates Strategy A detour metrics across all candidate delivery routes:
 *    - Detour distance (km)
 *    - Additional travel duration + service time (mins)
 *    - Shift limits (max work minutes)
 *    - Threshold bounds (maxDeltaDistanceKm, maxDeltaDurationMins)
 * 4. Produces a fully explainable, auditable rationale payload answering:
 *    - Which strategy was selected?
 *    - Which route/shipper was considered?
 *    - Why was it selected/rejected? (reason_code & human-readable explanation)
 *    - Which thresholds were applied?
 *    - What distance/time estimates were used?
 *    - Which context signals affected the decision?
 */
export function evaluateRecoveryDecision({
  recoveryRequest,
  candidateRoutes,
  warehouse,
  vehicle,
  contextSignals = DEFAULT_SIMULATED_CONTEXT,
  thresholds,
}: EvaluateDecisionParams): RecoveryDecisionResult {
  const maxDeltaDistanceKm = thresholds?.maxDeltaDistanceKm ?? OPTIMIZATION_CONFIG.reverseLogistics.maxDeltaDistanceKm;
  const maxDeltaDurationMins = thresholds?.maxDeltaDurationMins ?? OPTIMIZATION_CONFIG.reverseLogistics.maxDeltaDurationMins;
  const costPerKm = vehicle?.fuel_cost_vnd_per_km ?? 1200;

  const appliedThresholds = {
    max_delta_distance_km: maxDeltaDistanceKm,
    max_delta_duration_mins: maxDeltaDurationMins,
  };

  // Ensure context signal is explicitly labeled with source
  const sanitizedContext: ContextSignalSnapshot = {
    ...contextSignals,
    source: contextSignals.source || "SIMULATED",
  };

  // 1. Environmental & Context Signal Safety Check
  if (
    sanitizedContext.floodRiskLevel === "critical" ||
    sanitizedContext.floodRiskLevel === "high" ||
    sanitizedContext.severityLevel === "critical"
  ) {
    const defaultDedicatedKm = warehouse
      ? Number(((haversineDistanceMeters(warehouse.lat, warehouse.lng, recoveryRequest.lat, recoveryRequest.lng) * 2) / 1000).toFixed(2))
      : 8.0;
    const defaultDedicatedMins = Math.round((defaultDedicatedKm / 25) * 60) + OPTIMIZATION_CONFIG.defaultServiceTimeMins;
    const costVnd = Math.round(defaultDedicatedKm * costPerKm);

    const dedicatedTask = buildDedicatedRecoveryTask({
      recoveryRequest,
      warehouse,
      estimatedKm: defaultDedicatedKm,
      estimatedMins: defaultDedicatedMins,
      estimatedCostVnd: costVnd,
    });

    const rationale: ExplainableRationale = {
      strategy: "Strategy C - Dedicated Recovery",
      selected_strategy: "strategy_c_dedicated",
      reason_code: "ENVIRONMENTAL_HAZARD_RESTRICTION",
      explanation: `Environmental hazard (${sanitizedContext.floodRiskLevel} flood risk) prevents standard delivery route absorption. Dispatched as dedicated trip.`,
      considered_route_id: null,
      considered_shipper_id: null,
      applied_thresholds: appliedThresholds,
      evaluated_metrics: {
        evaluated_delta_km: defaultDedicatedKm,
        evaluated_delta_mins: defaultDedicatedMins,
        estimated_cost_delta_vnd: costVnd,
      },
      context_signals_snapshot: sanitizedContext,
      evidence: {
        feasible: false,
        estimated_detour_km: defaultDedicatedKm,
        estimated_extra_minutes: defaultDedicatedMins,
        threshold_distance_km: maxDeltaDistanceKm,
        threshold_duration_mins: maxDeltaDurationMins,
        distance_source: "HAVERSINE_URBAN_ESTIMATE",
        dedicated_task: dedicatedTask,
        rejection_reasons: [`Hazard condition: flood risk ${sanitizedContext.floodRiskLevel}`],
      },
    };

    return {
      recommended_strategy: "strategy_c_dedicated",
      selected_strategy: "strategy_c_dedicated",
      decision_source: "GALM_RULE_ENGINE",
      estimated_distance_delta_km: defaultDedicatedKm,
      estimated_duration_delta_mins: defaultDedicatedMins,
      estimated_cost_delta_vnd: costVnd,
      target_route_id: null,
      considered_shipper_id: null,
      context_signals_snapshot: sanitizedContext,
      rationale,
      is_strategy_a: false,
      is_fallback: true,
      dedicated_task: dedicatedTask,
    };
  }

  // 2. Candidate Route Availability Check
  const validRoutes = (candidateRoutes || []).filter(
    (r) => r.stops && r.stops.length >= 2 && r.status !== "completed" && r.status !== "cancelled"
  );

  if (validRoutes.length === 0) {
    const defaultDedicatedKm = warehouse
      ? Number(((haversineDistanceMeters(warehouse.lat, warehouse.lng, recoveryRequest.lat, recoveryRequest.lng) * 2) / 1000).toFixed(2))
      : 6.0;
    const defaultDedicatedMins = Math.round((defaultDedicatedKm / 25) * 60) + OPTIMIZATION_CONFIG.defaultServiceTimeMins;
    const costVnd = Math.round(defaultDedicatedKm * costPerKm);

    const dedicatedTask = buildDedicatedRecoveryTask({
      recoveryRequest,
      warehouse,
      estimatedKm: defaultDedicatedKm,
      estimatedMins: defaultDedicatedMins,
      estimatedCostVnd: costVnd,
    });

    const rationale: ExplainableRationale = {
      strategy: "Strategy C - Dedicated Recovery",
      selected_strategy: "strategy_c_dedicated",
      reason_code: "NO_ACTIVE_ROUTE_FOUND",
      explanation: "No active candidate delivery routes available to merge this recovery. Fallback to Strategy C dedicated trip.",
      considered_route_id: null,
      considered_shipper_id: null,
      applied_thresholds: appliedThresholds,
      evaluated_metrics: {
        evaluated_delta_km: defaultDedicatedKm,
        evaluated_delta_mins: defaultDedicatedMins,
        estimated_cost_delta_vnd: costVnd,
      },
      context_signals_snapshot: sanitizedContext,
      evidence: {
        feasible: false,
        estimated_detour_km: defaultDedicatedKm,
        estimated_extra_minutes: defaultDedicatedMins,
        threshold_distance_km: maxDeltaDistanceKm,
        threshold_duration_mins: maxDeltaDurationMins,
        distance_source: "HAVERSINE_URBAN_ESTIMATE",
        dedicated_task: dedicatedTask,
        rejection_reasons: ["No candidate routes provided for shop/date"],
      },
    };

    return {
      recommended_strategy: "strategy_c_dedicated",
      selected_strategy: "strategy_c_dedicated",
      decision_source: "GALM_RULE_ENGINE",
      estimated_distance_delta_km: defaultDedicatedKm,
      estimated_duration_delta_mins: defaultDedicatedMins,
      estimated_cost_delta_vnd: costVnd,
      target_route_id: null,
      considered_shipper_id: null,
      context_signals_snapshot: sanitizedContext,
      rationale,
      is_strategy_a: false,
      is_fallback: true,
      dedicated_task: dedicatedTask,
    };
  }

  // 3. Multi-Route Candidate Detour & Shift Evaluation
  let bestRoute: CandidateRoute | null = null;
  let bestStopIndex = -1;
  let minDeltaDist = Infinity;
  let minDeltaDur = Infinity;
  const candidateRejections: string[] = [];
  let rejectionCode: DecisionReasonCode = "DETOUR_EXCEEDS_THRESHOLD";

  for (const route of validRoutes) {
    // Check vehicle PaaS bag unit capacity if route vehicle specifies bag_capacity_units
    const candidateVehicle = route.vehicle || vehicle;
    if (candidateVehicle?.bag_capacity_units && candidateVehicle.bag_capacity_units > 0) {
      const existingRecoveries = (route.stops || []).filter((s) => s.stop_type === "recovery").length;
      if (existingRecoveries + 1 > candidateVehicle.bag_capacity_units) {
        candidateRejections.push(`Route ${route.id}: Vehicle bag unit capacity reached (${existingRecoveries + 1} > ${candidateVehicle.bag_capacity_units} units)`);
        rejectionCode = "CAPACITY_EXCEEDED";
        continue;
      }
    }

    const stops = [...(route.stops || [])].sort((a, b) => a.sequence_index - b.sequence_index);
    let routeBestIndex = -1;
    let routeMinDist = Infinity;
    let routeMinDur = Infinity;

    for (let i = 0; i < stops.length - 1; i++) {
      const stopA = stops[i];
      const stopB = stops[i + 1];

      const distAR = haversineDistanceMeters(stopA.lat, stopA.lng, recoveryRequest.lat, recoveryRequest.lng) / 1000;
      const distRB = haversineDistanceMeters(recoveryRequest.lat, recoveryRequest.lng, stopB.lat, stopB.lng) / 1000;
      const distAB = haversineDistanceMeters(stopA.lat, stopA.lng, stopB.lat, stopB.lng) / 1000;

      const deltaDist = distAR + distRB - distAB;
      const durAR = Math.round((distAR / 25) * 60);
      const durRB = Math.round((distRB / 25) * 60);
      const durAB = Math.round((distAB / 25) * 60);
      const deltaDur = durAR + durRB + OPTIMIZATION_CONFIG.defaultServiceTimeMins - durAB;

      if (deltaDist < routeMinDist) {
        routeMinDist = deltaDist;
        routeMinDur = deltaDur;
        routeBestIndex = i + 1;
      }
    }

    // Check shift limit if shift information is present
    if (route.shift && (route.total_duration_mins + routeMinDur) >= route.shift.max_work_minutes) {
      candidateRejections.push(`Route ${route.id}: Shift limit exceeded (${route.total_duration_mins + routeMinDur}m >= ${route.shift.max_work_minutes}m)`);
      rejectionCode = "SHIFT_LIMIT_EXCEEDED";
      continue;
    }

    // Check detour thresholds
    if (routeMinDist <= maxDeltaDistanceKm && routeMinDur <= maxDeltaDurationMins) {
      if (routeMinDist < minDeltaDist) {
        minDeltaDist = routeMinDist;
        minDeltaDur = routeMinDur;
        bestStopIndex = routeBestIndex;
        bestRoute = route;
      }
    } else {
      candidateRejections.push(`Route ${route.id}: Detour of ${routeMinDist.toFixed(2)}km exceeds threshold ${maxDeltaDistanceKm}km`);
    }
  }

  // 4. Decision Formulation
  if (bestRoute !== null) {
    // Strategy A Feasible!
    const finalDeltaDist = Number(minDeltaDist.toFixed(2));
    const finalDeltaDur = Math.round(minDeltaDur);
    const finalCostVnd = Math.round(finalDeltaDist * costPerKm);

    const rationale: ExplainableRationale = {
      strategy: "Strategy A - Merged Delivery Route",
      selected_strategy: "strategy_a_merged",
      reason_code: "WITHIN_ROUTE_DETOUR_THRESHOLD",
      explanation: `Existing delivery route ${bestRoute.id} can absorb the recovery request with minimal detour (${finalDeltaDist}km <= ${maxDeltaDistanceKm}km).`,
      considered_route_id: bestRoute.id,
      considered_shipper_id: bestRoute.shipper_id ?? null,
      applied_thresholds: appliedThresholds,
      evaluated_metrics: {
        evaluated_delta_km: finalDeltaDist,
        evaluated_delta_mins: finalDeltaDur,
        estimated_cost_delta_vnd: finalCostVnd,
        insertion_stop_index: bestStopIndex,
      },
      context_signals_snapshot: sanitizedContext,
      evidence: {
        feasible: true,
        route_id: bestRoute.id,
        shipper_id: bestRoute.shipper_id ?? null,
        estimated_detour_km: finalDeltaDist,
        estimated_extra_minutes: finalDeltaDur,
        threshold_distance_km: maxDeltaDistanceKm,
        threshold_duration_mins: maxDeltaDurationMins,
        distance_source: "HAVERSINE_URBAN_ESTIMATE",
        dedicated_task: null,
      },
    };

    return {
      recommended_strategy: "strategy_a_merged",
      selected_strategy: "strategy_a_merged",
      decision_source: "GALM_RULE_ENGINE",
      estimated_distance_delta_km: finalDeltaDist,
      estimated_duration_delta_mins: finalDeltaDur,
      estimated_cost_delta_vnd: finalCostVnd,
      target_route_id: bestRoute.id,
      considered_shipper_id: bestRoute.shipper_id ?? null,
      context_signals_snapshot: sanitizedContext,
      rationale,
      is_strategy_a: true,
      is_fallback: false,
      dedicated_task: null,
    };
  }

  // Strategy A Infeasible -> Explicit Strategy C Fallback
  const nearestRoute = validRoutes[0];
  const evaluatedDetour = minDeltaDist !== Infinity ? Number(minDeltaDist.toFixed(2)) : 4.5;
  const evaluatedDur = minDeltaDur !== Infinity ? Math.round(minDeltaDur) : 25;
  const costVnd = Math.round(evaluatedDetour * costPerKm);

  const fallbackExplanation = rejectionCode === "SHIFT_LIMIT_EXCEEDED"
    ? `Candidate routes cannot absorb recovery stop due to shipper shift duration constraints. Fallback to Strategy C.`
    : rejectionCode === "CAPACITY_EXCEEDED"
    ? `Candidate routes cannot absorb recovery stop due to vehicle bag unit capacity limits. Fallback to Strategy C.`
    : `Candidate routes cannot absorb recovery stop (detour of ${evaluatedDetour}km exceeds threshold ${maxDeltaDistanceKm}km). Fallback to Strategy C.`;

  const dedicatedTask = buildDedicatedRecoveryTask({
    recoveryRequest,
    warehouse,
    estimatedKm: evaluatedDetour,
    estimatedMins: evaluatedDur,
    estimatedCostVnd: costVnd,
  });

  const rationale: ExplainableRationale = {
    strategy: "Strategy C - Dedicated Recovery",
    selected_strategy: "strategy_c_dedicated",
    reason_code: rejectionCode,
    explanation: fallbackExplanation,
    considered_route_id: nearestRoute?.id ?? null,
    considered_shipper_id: nearestRoute?.shipper_id ?? null,
    applied_thresholds: appliedThresholds,
    evaluated_metrics: {
      evaluated_delta_km: evaluatedDetour,
      evaluated_delta_mins: evaluatedDur,
      estimated_cost_delta_vnd: costVnd,
    },
    context_signals_snapshot: sanitizedContext,
    evidence: {
      feasible: false,
      route_id: nearestRoute?.id ?? null,
      shipper_id: nearestRoute?.shipper_id ?? null,
      estimated_detour_km: evaluatedDetour,
      estimated_extra_minutes: evaluatedDur,
      threshold_distance_km: maxDeltaDistanceKm,
      threshold_duration_mins: maxDeltaDurationMins,
      distance_source: "HAVERSINE_URBAN_ESTIMATE",
      dedicated_task: dedicatedTask,
      rejection_reasons: candidateRejections,
    },
  };

  return {
    recommended_strategy: "strategy_c_dedicated",
    selected_strategy: "strategy_c_dedicated",
    decision_source: "GALM_RULE_ENGINE",
    estimated_distance_delta_km: evaluatedDetour,
    estimated_duration_delta_mins: evaluatedDur,
    estimated_cost_delta_vnd: costVnd,
    target_route_id: null,
    considered_shipper_id: nearestRoute?.shipper_id ?? null,
    context_signals_snapshot: sanitizedContext,
    rationale,
    is_strategy_a: false,
    is_fallback: true,
    dedicated_task: dedicatedTask,
  };
}

/**
 * Backward-compatible helper for GB-002 caller compatibility
 */
export interface EvaluateStrategyAParams {
  recoveryRequest: RecoveryRequest;
  activeRoute?: CandidateRoute | null;
  vehicle?: Vehicle | null;
  contextSignals?: ContextSignalSnapshot;
}

export interface StrategyAEvaluationResult {
  decision: Omit<RecoveryDecision, "id" | "created_at">;
  canMerge: boolean;
  bestStopIndex?: number;
}

export function evaluateRecoveryStrategyA({
  recoveryRequest,
  activeRoute,
  vehicle,
  contextSignals = DEFAULT_SIMULATED_CONTEXT,
}: EvaluateStrategyAParams): StrategyAEvaluationResult {
  if (!activeRoute) {
    const defaultDistanceDelta = 2.5;
    const defaultDurationDelta = 15;
    const costPerKm = vehicle?.fuel_cost_vnd_per_km ?? 3000;
    const estimatedCostDelta = Math.round(defaultDistanceDelta * costPerKm);

    return {
      canMerge: true,
      decision: {
        recovery_request_id: recoveryRequest.id,
        recommended_strategy: "strategy_a_merged",
        selected_strategy: "strategy_a_merged",
        decision_source: "GALM_RULE_ENGINE",
        estimated_distance_delta_km: defaultDistanceDelta,
        estimated_duration_delta_mins: defaultDurationDelta,
        estimated_cost_delta_vnd: estimatedCostDelta,
        target_route_id: null,
        context_signals_snapshot: { ...contextSignals },
        rationale: {
          strategy: "Strategy A - Merged Delivery Route",
          feasible: true,
          is_candidate_available: false,
          note: "Assigned default Strategy A parameters for scheduled route dispatch",
          carbon_efficiency: "High (Combined forward-reverse trip)",
        },
        decided_by: null,
      },
    };
  }

  const result = evaluateRecoveryDecision({
    recoveryRequest,
    candidateRoutes: [activeRoute],
    vehicle,
    contextSignals,
  });

  return {
    canMerge: result.is_strategy_a,
    bestStopIndex: result.rationale.evaluated_metrics.insertion_stop_index,
    decision: {
      recovery_request_id: recoveryRequest.id,
      recommended_strategy: result.recommended_strategy,
      selected_strategy: result.selected_strategy,
      decision_source: result.decision_source,
      estimated_distance_delta_km: result.estimated_distance_delta_km,
      estimated_duration_delta_mins: result.estimated_duration_delta_mins,
      estimated_cost_delta_vnd: result.estimated_cost_delta_vnd,
      target_route_id: result.target_route_id,
      context_signals_snapshot: { ...result.context_signals_snapshot },
      rationale: {
        feasible: result.is_strategy_a,
        ...result.rationale,
      },
      decided_by: null,
    },
  };
}
