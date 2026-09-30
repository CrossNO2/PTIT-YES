import {
  PaasBag,
  PaasBagStatus,
  BagCondition,
  BagEventType,
  OrderBagAssignment,
} from "@/types/database";

/**
 * Packaging-as-a-Service (PaaS) Bag Lifecycle State Machine
 *
 * 10 unique lifecycle states in a closed loop:
 *   available
 *   → assigned
 *   → in_delivery
 *   → with_customer
 *   → return_requested
 *   → recovering
 *   → at_hub
 *   → inspection
 *   → maintenance
 *   → ready_for_reuse
 *   (→ available closes the loop)
 *
 * Damaged / Scrap Path:
 *   inspection / maintenance → damaged → retired
 *   inspection / maintenance → retired
 */

export const ALLOWED_TRANSITIONS: Record<PaasBagStatus, readonly PaasBagStatus[]> = {
  available: ["assigned", "retired"] as const,
  assigned: ["in_delivery", "available"] as const,
  in_delivery: ["with_customer", "at_hub", "assigned"] as const,
  with_customer: ["return_requested"] as const,
  return_requested: ["recovering", "with_customer"] as const,
  recovering: ["at_hub", "return_requested"] as const,
  at_hub: ["inspection", "maintenance", "retired"] as const,
  inspection: ["maintenance", "ready_for_reuse", "damaged", "retired"] as const,
  maintenance: ["ready_for_reuse", "damaged", "retired"] as const,
  ready_for_reuse: ["available", "assigned"] as const,
  damaged: ["retired", "maintenance"] as const,
  retired: [] as const, // Terminal state: zero outgoing transitions allowed
};

export class InvalidTransitionError extends Error {
  constructor(public readonly fromStatus: PaasBagStatus, public readonly toStatus: PaasBagStatus) {
    super(`INVALID_BAG_TRANSITION: Cannot transition bag from '${fromStatus}' to '${toStatus}'`);
    this.name = "InvalidTransitionError";
  }
}

export class BagAssignmentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BagAssignmentConflictError";
  }
}

/**
 * Checks whether a given status transition is permitted by the PaaS lifecycle state machine.
 */
export function isValidBagTransition(fromStatus: PaasBagStatus, toStatus: PaasBagStatus): boolean {
  if (fromStatus === toStatus) return true; // Idempotent same-state check
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed) return false;
  return allowed.includes(toStatus);
}

/**
 * Asserts that a status transition is permitted. Throws InvalidTransitionError if rejected.
 */
export function assertValidBagTransition(fromStatus: PaasBagStatus, toStatus: PaasBagStatus): void {
  if (fromStatus === toStatus) return;
  if (!isValidBagTransition(fromStatus, toStatus)) {
    throw new InvalidTransitionError(fromStatus, toStatus);
  }
}

/**
 * Maps a target status transition to its canonical BagEventType for immutable audit logging.
 */
export function resolveEventTypeForTransition(
  toStatus: PaasBagStatus,
  action?: string,
  fromStatus?: PaasBagStatus
): BagEventType {
  // ready_for_reuse -> available is specifically RETURNED_TO_STOCK
  if (fromStatus === "ready_for_reuse" && toStatus === "available") {
    return "RETURNED_TO_STOCK";
  }
  if (fromStatus === "assigned" && toStatus === "available") {
    return "RETURNED_TO_STOCK";
  }
  if (toStatus === "ready_for_reuse") {
    if (fromStatus === "maintenance") {
      return action === "repair" ? "REPAIRED" : "CLEANED_SANITIZED";
    }
    return "INSPECTED";
  }

  switch (toStatus) {
    case "assigned":
      return "ASSIGNED_TO_ORDER";
    case "in_delivery":
      return "DISPATCHED_TO_SHIPPER";
    case "with_customer":
      return "DELIVERED_TO_CUSTOMER";
    case "return_requested":
      return "RECOVERY_REQUESTED";
    case "recovering":
      return "PICKED_UP_BY_SHIPPER";
    case "at_hub":
      return "RECEIVED_AT_HUB";
    case "inspection":
      return "INSPECTED";
    case "maintenance":
      return action === "repair" ? "REPAIRED" : "CLEANED_SANITIZED";
    case "available":
      return "RETURNED_TO_STOCK";
    case "damaged":
      return "FLAGGED_DAMAGED";
    case "retired":
      return "RETIRED";
    default:
      return "REGISTERED";
  }
}

export interface AssignBagParams {
  bag: PaasBag;
  orderId: string;
  shopId: string;
  actorUserId: string;
  activeAssignments: OrderBagAssignment[];
}

/**
 * Step 1: Assign PaaS Bag to outbound order (Shop packing flow)
 * - Bag must be 'available' or 'ready_for_reuse'
 * - Bag cannot be already actively assigned to another order
 * - Order cannot already have a primary active bag
 * - Custody is transferred to shop (with actorUserId)
 * - Location remains at shop/warehouse
 */
export function assignBagToOrder({
  bag,
  orderId,
  shopId,
  actorUserId,
  activeAssignments,
}: AssignBagParams): {
  updatedBag: PaasBag;
  assignment: OrderBagAssignment;
} {
  if (bag.status !== "available" && bag.status !== "ready_for_reuse") {
    throw new Error(
      `INVALID_BAG_STATE: Bag ${bag.bag_code} is currently '${bag.status}', must be 'available' or 'ready_for_reuse'`
    );
  }

  // Enforce unique active bag: bag cannot be actively assigned to any order
  const bagAlreadyActive = activeAssignments.some(
    (a) => a.bag_id === bag.id && a.is_active
  );
  if (bagAlreadyActive) {
    throw new BagAssignmentConflictError(
      `BAG_ALREADY_ASSIGNED: Bag ${bag.bag_code} is already actively assigned to another order`
    );
  }

  // Enforce MVP order constraint: 1 order -> 1 primary active bag
  const orderHasPrimaryBag = activeAssignments.some(
    (a) => a.order_id === orderId && a.is_primary && a.is_active
  );
  if (orderHasPrimaryBag) {
    throw new BagAssignmentConflictError(
      `ORDER_ALREADY_HAS_PRIMARY_BAG: Order ${orderId} already has an active primary bag assigned`
    );
  }

  assertValidBagTransition(bag.status, "assigned");

  const updatedBag: PaasBag = {
    ...bag,
    status: "assigned",
    current_shop_id: shopId,
    current_holder_type: "shop",
    current_holder_user_id: actorUserId,
    current_location_type: "warehouse",
    updated_at: new Date().toISOString(),
  };

  const assignment: OrderBagAssignment = {
    id: crypto.randomUUID(),
    order_id: orderId,
    bag_id: bag.id,
    is_primary: true,
    is_active: true,
    assigned_at: new Date().toISOString(),
  };

  return { updatedBag, assignment };
}

/**
 * Step 2: Dispatch Bag into Delivery
 * - Transition: assigned → in_delivery
 * - Custody: shipper (shipperUserId)
 * - Location: transit_vehicle
 */
export function dispatchBagDelivery(bag: PaasBag, shipperUserId: string): PaasBag {
  assertValidBagTransition(bag.status, "in_delivery");

  return {
    ...bag,
    status: "in_delivery",
    current_holder_type: "shipper",
    current_holder_user_id: shipperUserId,
    current_location_type: "transit_vehicle",
    updated_at: new Date().toISOString(),
  };
}

/**
 * Step 3: Complete Delivery to Customer
 * - Transition: in_delivery → with_customer
 * - Custody: customer (customerUserId)
 * - Location: customer_address
 */
export function completeBagDelivery(bag: PaasBag, customerUserId: string): PaasBag {
  assertValidBagTransition(bag.status, "with_customer");

  return {
    ...bag,
    status: "with_customer",
    current_holder_type: "customer",
    current_holder_user_id: customerUserId,
    current_location_type: "customer_address",
    updated_at: new Date().toISOString(),
  };
}

export interface RecoveryRequestCreationResult {
  updatedBag: PaasBag;
  recoveryRequestId: string;
}

/**
 * Step 4: Customer initiates bag recovery request
 * - Transition: with_customer → return_requested
 * - Custody remains customer until shipper picks up
 * - Location remains customer_address
 * - Enforces no duplicate active recovery request for the same bag
 */
export function requestBagRecovery(
  bag: PaasBag,
  hasActiveRecovery: boolean
): RecoveryRequestCreationResult {
  if (bag.status !== "with_customer") {
    throw new Error(
      `INVALID_BAG_STATE: Bag ${bag.bag_code} is currently '${bag.status}', must be 'with_customer' to request recovery`
    );
  }

  if (hasActiveRecovery) {
    throw new Error(
      `DUPLICATE_ACTIVE_RECOVERY_REQUEST: An active recovery request already exists for bag ${bag.bag_code}`
    );
  }

  assertValidBagTransition(bag.status, "return_requested");

  const updatedBag: PaasBag = {
    ...bag,
    status: "return_requested",
    updated_at: new Date().toISOString(),
  };

  return {
    updatedBag,
    recoveryRequestId: crypto.randomUUID(),
  };
}

/**
 * Step 5: Shipper begins physical recovery pickup
 * - Transition: return_requested → recovering
 * - Custody: shipper (shipperUserId)
 * - Location: transit_vehicle
 */
export function startBagRecovery(bag: PaasBag, shipperUserId: string): PaasBag {
  assertValidBagTransition(bag.status, "recovering");

  return {
    ...bag,
    status: "recovering",
    current_holder_type: "shipper",
    current_holder_user_id: shipperUserId,
    current_location_type: "transit_vehicle",
    updated_at: new Date().toISOString(),
  };
}

export interface VerifyRecoveryParams {
  bag: PaasBag;
  scannedQrCode: string;
  targetWarehouseId: string;
  condition?: BagCondition;
  isAlreadyCompleted?: boolean;
}

export interface VerifyRecoveryResult {
  updatedBag: PaasBag;
  isIdempotentNoop: boolean;
  depositRefundEligible: boolean;
  greenPointsAwardEligible: boolean;
}

/**
 * Step 6: Shipper completes recovery at Hub / Depot
 * - Transition: recovering → at_hub
 * - Custody: warehouse (current_holder_user_id = null)
 * - Location: warehouse (current_warehouse_id = targetWarehouseId)
 * - BUSINESS INVARIANT: usage_count is NOT incremented!
 * - Idempotency: if already completed, returns state without double refunds/points
 */
export function completeBagRecovery({
  bag,
  scannedQrCode,
  targetWarehouseId,
  condition = "good",
  isAlreadyCompleted = false,
}: VerifyRecoveryParams): VerifyRecoveryResult {
  if (isAlreadyCompleted || bag.status === "at_hub") {
    return {
      updatedBag: bag,
      isIdempotentNoop: true,
      depositRefundEligible: false,
      greenPointsAwardEligible: false,
    };
  }

  // Safe Warehouse Resolution Check: Reject recovery if no valid warehouse resolved
  if (!targetWarehouseId || targetWarehouseId.trim() === "") {
    throw new Error(
      "NO_VALID_WAREHOUSE_FOUND: Target warehouse ID is required for recovery completion"
    );
  }

  // QR Validation (hash or bag code)
  if (bag.qr_code_hash !== scannedQrCode && bag.bag_code !== scannedQrCode) {
    throw new Error(
      `QR_MISMATCH: Scanned QR code does not match bag identity for ${bag.bag_code}`
    );
  }

  assertValidBagTransition(bag.status, "at_hub");

  const initialUsageCount = bag.usage_count;

  const updatedBag: PaasBag = {
    ...bag,
    status: "at_hub",
    condition,
    current_holder_type: "warehouse",
    current_holder_user_id: null,
    current_location_type: "warehouse",
    current_warehouse_id: targetWarehouseId,
    usage_count: initialUsageCount, // INVARIANT: Strictly unchanged!
    updated_at: new Date().toISOString(),
  };

  // Explicit assertion of invariant
  if (updatedBag.usage_count !== initialUsageCount) {
    throw new Error("INVARIANT_VIOLATION: usage_count must NOT increment during bag recovery pickup");
  }

  return {
    updatedBag,
    isIdempotentNoop: false,
    depositRefundEligible: true,
    greenPointsAwardEligible: true,
  };
}

/**
 * Step 7: Hub operator begins formal inspection
 * - Transition: at_hub → inspection
 * - Usage count is NOT incremented
 */
export function startBagInspection(bag: PaasBag, warehouseId: string): PaasBag {
  assertValidBagTransition(bag.status, "inspection");

  return {
    ...bag,
    status: "inspection",
    current_warehouse_id: warehouseId,
    current_holder_type: "warehouse",
    current_holder_user_id: null,
    current_location_type: "warehouse",
    updated_at: new Date().toISOString(),
  };
}

/**
 * Step 8: Send bag for washing / sanitization / maintenance
 * - Transition: inspection → maintenance
 * - Location: cleaning_station
 * - Usage count is NOT incremented
 */
export function sendBagToMaintenance(bag: PaasBag, warehouseId: string): PaasBag {
  assertValidBagTransition(bag.status, "maintenance");

  return {
    ...bag,
    status: "maintenance",
    current_warehouse_id: warehouseId,
    current_holder_type: "warehouse",
    current_holder_user_id: null,
    current_location_type: "cleaning_station",
    updated_at: new Date().toISOString(),
  };
}

export type InspectionResult = "passed" | "needs_wash" | "repaired" | "degraded" | "scrapped";
export type MaintenanceAction = "inspected_ok" | "washed_sanitized" | "stitched_repaired" | "scrapped";

export interface CompleteInspectionWashingParams {
  bag: PaasBag;
  warehouseId: string;
  result: InspectionResult;
  action: MaintenanceAction;
  notes?: string;
}

export interface CompleteInspectionWashingResult {
  updatedBag: PaasBag;
  cycleCompleted: boolean;
  usageIncremented: boolean;
  newUsageCount: number;
}

/**
 * Step 9: Complete Inspection & Washing (The Core Reusability Accounting Point)
 *
 * CRITICAL BUSINESS INVARIANT:
 * - usage_count ONLY increments by exactly 1 when:
 *     result === 'passed'
 *     AND bag transitions to 'ready_for_reuse'
 * - usage_count NEVER increments when:
 *     result === 'needs_wash' (status -> maintenance)
 *     result === 'degraded' (status -> damaged)
 *     result === 'scrapped' (status -> retired)
 * - IDEMPOTENCY:
 *     If bag is already 'ready_for_reuse', calling this again does NOT increment usage_count!
 */
export function completeBagInspectionWashing({
  bag,
  warehouseId,
  result,
  action,
}: CompleteInspectionWashingParams): CompleteInspectionWashingResult {
  // Idempotency check: already ready for reuse
  if (bag.status === "ready_for_reuse" && result === "passed") {
    return {
      updatedBag: bag,
      cycleCompleted: false,
      usageIncremented: false,
      newUsageCount: bag.usage_count,
    };
  }

  // Must be in inspection or maintenance to be certified
  if (bag.status !== "inspection" && bag.status !== "maintenance") {
    throw new Error(
      `INVALID_BAG_STATE: Bag ${bag.bag_code} is in '${bag.status}', must be in 'inspection' or 'maintenance'`
    );
  }

  let nextStatus: PaasBagStatus;
  let nextCondition: BagCondition = bag.condition;
  let cycleCompleted = false;

  switch (result) {
    case "passed":
      nextStatus = "ready_for_reuse";
      nextCondition = "good";
      cycleCompleted = true;
      break;
    case "needs_wash":
      nextStatus = "maintenance";
      nextCondition = "needs_cleaning";
      cycleCompleted = false;
      break;
    case "degraded":
      nextStatus = "damaged";
      nextCondition = "damaged";
      cycleCompleted = false;
      break;
    case "scrapped":
      nextStatus = "retired";
      nextCondition = "scrapped";
      cycleCompleted = false;
      break;
    default:
      nextStatus = "available";
      cycleCompleted = false;
  }

  assertValidBagTransition(bag.status, nextStatus);

  const initialUsageCount = bag.usage_count;
  const newUsageCount = cycleCompleted ? initialUsageCount + 1 : initialUsageCount;

  const updatedBag: PaasBag = {
    ...bag,
    status: nextStatus,
    condition: nextCondition,
    usage_count: newUsageCount,
    last_inspected_at: new Date().toISOString(),
    last_cleaned_at: action === "washed_sanitized" ? new Date().toISOString() : bag.last_cleaned_at,
    current_warehouse_id: warehouseId,
    current_holder_type: "warehouse",
    current_holder_user_id: null,
    current_location_type: "warehouse",
    updated_at: new Date().toISOString(),
  };

  return {
    updatedBag,
    cycleCompleted,
    usageIncremented: cycleCompleted,
    newUsageCount,
  };
}

/**
 * Step 10: Return certified bag to active inventory stock
 * - Transition: ready_for_reuse → available
 * - Usage count is NOT incremented
 */
export function returnBagToStock(bag: PaasBag): PaasBag {
  assertValidBagTransition(bag.status, "available");

  return {
    ...bag,
    status: "available",
    current_holder_type: "warehouse",
    current_holder_user_id: null,
    current_location_type: "warehouse",
    updated_at: new Date().toISOString(),
  };
}

/**
 * Terminal Step: Retire/Scrap bag permanently
 * - Transition: from damaged, inspection, maintenance, or available → retired
 * - Zero outgoing transitions possible once in 'retired'
 */
export function retireBag(bag: PaasBag, _reason: string): PaasBag {
  assertValidBagTransition(bag.status, "retired");

  return {
    ...bag,
    status: "retired",
    condition: "scrapped",
    current_holder_type: "warehouse",
    current_holder_user_id: null,
    current_location_type: "warehouse",
    updated_at: new Date().toISOString(),
  };
}
