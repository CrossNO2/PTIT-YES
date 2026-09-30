// GreenBridge v2 Database Types
// Packaging-as-a-Service (PaaS) Domain Architecture

export type UserAccountType = 'customer' | 'platform_admin' | 'shop_user';
export type ShopMemberRole = 'owner' | 'admin' | 'dispatcher' | 'shipper';
export type VehicleType = 'electric_motorbike' | 'motorbike' | 'small_van' | 'light_truck';
export type OrderStatus = 'pending' | 'ready' | 'assigned' | 'delivering' | 'delivered' | 'failed' | 'cancelled';

export type PaasBagStatus =
  | 'available'
  | 'assigned'
  | 'in_delivery'
  | 'with_customer'
  | 'return_requested'
  | 'recovering'
  | 'at_hub'
  | 'inspection'
  | 'maintenance'
  | 'ready_for_reuse'
  | 'damaged'
  | 'retired';

export type BagCondition =
  | 'new'
  | 'excellent'
  | 'good'
  | 'fair'
  | 'needs_cleaning'
  | 'needs_repair'
  | 'damaged'
  | 'scrapped';

export type BagEventType =
  | 'REGISTERED'
  | 'ASSIGNED_TO_ORDER'
  | 'DISPATCHED_TO_SHIPPER'
  | 'DELIVERED_TO_CUSTOMER'
  | 'RECOVERY_REQUESTED'
  | 'PICKED_UP_BY_SHIPPER'
  | 'DEPOSITED_AT_PUDO'
  | 'RECEIVED_AT_HUB'
  | 'INSPECTED'
  | 'CLEANED_SANITIZED'
  | 'REPAIRED'
  | 'RETURNED_TO_STOCK'
  | 'FLAGGED_DAMAGED'
  | 'RETIRED';

export type RecoveryRequestStatus =
  | 'requested'
  | 'planned'
  | 'assigned'
  | 'in_transit'
  | 'picked_up'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'pending';

export type RecoveryStrategyType =
  | 'strategy_a_merged'
  | 'strategy_b_pudo'
  | 'strategy_c_dedicated';

export type RouteStatus =
  | 'draft'
  | 'optimizing'
  | 'optimized'
  | 'approved'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type RouteStopType =
  | 'warehouse'
  | 'delivery'
  | 'recovery'
  | 'pudo_dropoff'
  | 'maintenance_hub'
  | 'pickup';

export type RouteStopStatus =
  | 'pending'
  | 'arrived'
  | 'completed'
  | 'failed'
  | 'skipped';

export type DepositStatus =
  | 'held'
  | 'refunded'
  | 'forfeited'
  | 'cancelled';

export type PointTransactionType =
  | 'bag_return_reward'
  | 'prompt_return_bonus'
  | 'voucher_redemption'
  | 'admin_adjustment'
  | 'expired';

export type DiscountType = 'fixed_amount' | 'percentage';
export type VoucherRedemptionStatus = 'active' | 'used' | 'expired' | 'cancelled';

export type SignalType =
  | 'TRAFFIC_CONGESTION'
  | 'WEATHER_RAIN'
  | 'FLOODING_RISK'
  | 'ETA_SURGE'
  | 'ROAD_RESTRICTION';

export type SignalSource = 'SIMULATED' | 'API' | 'SYSTEM' | 'OPERATOR';

// 1. Identity & RBAC
export interface Profile {
  id: string;
  email: string;
  account_type: UserAccountType;
  name: string;
  phone: string;
  avatar_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 2. Organizations / Shops
export interface Shop {
  id: string;
  name: string;
  slug: string;
  address: string;
  lat: number;
  lng: number;
  logo_url?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShopMember {
  id: string;
  shop_id: string;
  user_id: string;
  member_role: ShopMemberRole;
  status: 'active' | 'invited' | 'suspended';
  joined_at: string;
  created_at: string;
  updated_at: string;
}

// 3. Hubs, Fleet & Shifts
export interface Warehouse {
  id: string;
  shop_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  is_default: boolean;
  has_cleaning_facility: boolean;
  has_inspection_depot: boolean;
  status: 'active' | 'maintenance' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  shop_id: string;
  name: string;
  vehicle_type: VehicleType;
  license_plate: string;
  capacity_kg: number;
  bag_capacity_units: number;
  co2_kg_per_km: number;
  fuel_cost_vnd_per_km: number;
  status: 'active' | 'maintenance' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface ShipperShift {
  id: string;
  shop_id: string;
  shipper_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  start_warehouse_id?: string | null;
  max_work_minutes: number;
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface PudoLocation {
  id: string;
  name: string;
  pudo_type: 'smart_locker' | 'convenience_store' | 'partner_hub';
  address: string;
  lat: number;
  lng: number;
  total_slots: number;
  available_slots: number;
  operating_hours: string;
  status: 'active' | 'maintenance' | 'inactive';
  created_at: string;
  updated_at: string;
}

// 4. PaaS Bag Asset & Lifecycle
export interface PaasBag {
  id: string;
  bag_code: string;
  qr_code_hash: string;
  /** GreenBridge Platform owns all reusable packaging assets */
  owner_entity: string;
  is_platform_owned: boolean;
  /** Commercial allocation: shop currently leasing/operating this bag in their fleet */
  current_shop_id?: string | null;
  /** Custody: entity currently holding physical possession/responsibility */
  current_holder_type: 'warehouse' | 'shop' | 'shipper' | 'customer' | 'pudo';
  current_holder_user_id?: string | null;
  current_holder_id?: string | null;
  /** Physical location */
  current_location_type: 'warehouse' | 'customer_address' | 'transit_vehicle' | 'pudo_locker' | 'cleaning_station';
  current_warehouse_id?: string | null;
  current_pudo_id?: string | null;
  model_type: string;
  size_category: 'small' | 'medium' | 'large' | 'insulated';
  status: PaasBagStatus;
  condition: BagCondition;
  usage_count: number;
  max_cycles: number;
  manufacture_date?: string | null;
  last_inspected_at?: string | null;
  last_cleaned_at?: string | null;
  created_at: string;
  updated_at: string;
  /** @deprecated Replaced by current_shop_id in v2 */
  shop_id?: string | null;
}

export interface BagLifecycleEvent {
  id: string;
  bag_id: string;
  from_status?: PaasBagStatus | null;
  to_status: PaasBagStatus;
  event_type: BagEventType;
  actor_id?: string | null;
  order_id?: string | null;
  recovery_request_id?: string | null;
  route_id?: string | null;
  location_notes?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BagMaintenanceLog {
  id: string;
  bag_id: string;
  warehouse_id: string;
  inspector_id: string;
  inspection_result: 'passed' | 'needs_wash' | 'repaired' | 'degraded' | 'scrapped';
  maintenance_action: 'inspected_ok' | 'washed_sanitized' | 'stitched_repaired' | 'scrapped';
  water_saved_liters: number;
  notes?: string | null;
  completed_at: string;
}

// 5. Orders & Logistics
export interface Order {
  id: string;
  shop_id: string;
  customer_id?: string | null;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  lat: number;
  lng: number;
  delivery_date: string;
  time_slot_start: string;
  time_slot_end: string;
  weight_kg: number;
  priority: number;
  notes?: string | null;
  status: OrderStatus;
  /** @deprecated In v2, use order_bag_assignments as single source of truth */
  assigned_bag_id?: string | null;
  assigned_shipper_id?: string | null;
  assigned_route_id?: string | null;
  started_delivery_at?: string | null;
  delivered_at?: string | null;
  failure_reason?: string | null;
  proof_image_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderBagAssignment {
  id: string;
  order_id: string;
  bag_id: string;
  assigned_at: string;
  is_primary: boolean;
  is_active: boolean;
}

export interface OrderStatusHistory {
  id: string;
  order_id: string;
  old_status?: OrderStatus | null;
  new_status: OrderStatus;
  changed_by?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface OrderAccessLog {
  id: string;
  order_id: string;
  accessed_by: string;
  action: string;
  reason: string;
  ip_address?: string | null;
  created_at: string;
}

// 6. Routes & Stops
export interface Route {
  id: string;
  shop_id: string;
  warehouse_id: string;
  route_date: string;
  shipper_id?: string | null;
  vehicle_id?: string | null;
  naive_distance_km: number;
  optimized_distance_km: number;
  total_duration_mins: number;
  estimated_cost_vnd: number;
  status: RouteStatus;
  route_type: 'delivery_only' | 'delivery_with_recovery' | 'dedicated_recovery';
  optimization_version: number;
  approved_by?: string | null;
  approved_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RouteStop {
  id: string;
  route_id: string;
  stop_type: RouteStopType;
  order_id?: string | null;
  recovery_request_id?: string | null;
  pudo_location_id?: string | null;
  sequence_index: number;
  estimated_arrival?: string | null;
  distance_from_previous_km: number;
  duration_from_previous_mins: number;
  status: RouteStopStatus;
  arrived_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  /** @deprecated Compatibility alias for v1 UI migration */
  pickup_id?: string | null;
}

export interface RouteMatrixCache {
  id: string;
  origin_key: string;
  destination_key: string;
  travel_mode: string;
  routing_preference: string;
  departure_bucket: string;
  distance_meters: number;
  duration_seconds: number;
  expires_at: string;
  created_at: string;
}

export interface ContextSignal {
  id: string;
  signal_type: SignalType;
  source: SignalSource;
  area_name: string;
  lat?: number | null;
  lng?: number | null;
  severity_level: 'low' | 'medium' | 'high' | 'critical';
  signal_data: Record<string, unknown>;
  valid_from: string;
  valid_until: string;
  created_at: string;
}

// 7. Recovery Domain
export interface RecoveryRequest {
  id: string;
  shop_id: string;
  customer_id: string;
  bag_id: string;
  order_id?: string | null;
  status: RecoveryRequestStatus;
  recovery_strategy: RecoveryStrategyType;
  pickup_address: string;
  lat: number;
  lng: number;
  pickup_date: string;
  time_slot_start: string;
  time_slot_end: string;
  pudo_location_id?: string | null;
  assigned_route_id?: string | null;
  assigned_shipper_id?: string | null;
  picked_up_at?: string | null;
  completed_at?: string | null;
  failure_reason?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  /** @deprecated Compatibility alias for v1 UI migration */
  address?: string;
  /** @deprecated Compatibility alias for v1 UI migration */
  packaging_type?: string;
  /** @deprecated Compatibility alias for v1 UI migration */
  estimated_quantity_kg?: number;
  /** @deprecated Compatibility alias for v1 UI migration */
  verified_quantity_kg?: number | null;
  /** @deprecated Compatibility alias for v1 UI migration */
  available_from?: string;
  /** @deprecated Compatibility alias for v1 UI migration */
  available_until?: string;
}

export interface RecoveryDecision {
  id: string;
  recovery_request_id: string;
  recommended_strategy: RecoveryStrategyType;
  selected_strategy: RecoveryStrategyType;
  decision_source: 'GALM_AI' | 'GALM_RULE_ENGINE' | 'OPERATOR_OVERRIDE' | 'SIMULATED';
  estimated_distance_delta_km: number;
  estimated_duration_delta_mins: number;
  estimated_cost_delta_vnd: number;
  target_route_id?: string | null;
  context_signals_snapshot: Record<string, unknown>;
  rationale: Record<string, unknown>;
  decided_by?: string | null;
  created_at: string;
}

export interface DedicatedRecoveryTask {
  id: string;
  recovery_request_id: string;
  shop_id: string;
  customer_id: string;
  bag_id: string;
  pickup_address: string;
  lat: number;
  lng: number;
  pickup_date: string;
  time_slot_start: string;
  time_slot_end: string;
  depot_warehouse_id: string | null;
  depot_address?: string | null;
  depot_lat?: number | null;
  depot_lng?: number | null;
  estimated_distance_km: number;
  estimated_duration_mins: number;
  estimated_cost_vnd: number;
  task_status: 'pending_dispatch' | 'dispatched' | 'in_progress' | 'completed' | 'cancelled';
  target_route_type: 'dedicated_recovery';
  assigned_route_id?: string | null;
  assigned_shipper_id?: string | null;
  created_at: string;
}

// 8. Financials & Incentives
export interface CustomerDeposit {
  id: string;
  customer_id: string;
  shop_id: string;
  bag_id: string;
  order_id?: string | null;
  deposit_amount_vnd: number;
  status: DepositStatus;
  refund_amount_vnd?: number | null;
  deduction_reason?: string | null;
  held_at: string;
  refunded_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GreenPointTransaction {
  id: string;
  customer_id: string;
  points_delta: number;
  transaction_type: PointTransactionType;
  reference_type: 'recovery_request' | 'bag_return' | 'voucher_redemption' | 'deposit' | 'admin_adjustment';
  reference_id: string;
  description: string;
  idempotency_key: string;
  created_at: string;
}

export interface Voucher {
  id: string;
  shop_id?: string | null;
  name: string;
  description?: string | null;
  points_required: number;
  discount_type: DiscountType;
  discount_value: number;
  quantity: number;
  expiry_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VoucherRedemption {
  id: string;
  voucher_id: string;
  customer_id: string;
  points_spent: number;
  redemption_code: string;
  qr_token_hash: string;
  qr_expires_at: string;
  status: VoucherRedemptionStatus;
  redeemed_at: string;
  used_at?: string | null;
  created_at: string;
  updated_at: string;
}

// 9. ESG Circularity Metrics
export interface ESGReport {
  id: string;
  shop_id: string;
  route_id: string;
  report_date: string;
  naive_distance_km: number;
  optimized_distance_km: number;
  km_saved: number;
  co2_saved_kg: number;
  fuel_cost_saved_vnd: number;
  bags_recovered_count: number;
  single_use_packaging_avoided_count: number;
  plastic_waste_prevented_kg: number;
  cost_per_order_vnd: number;
  cost_per_recovery_vnd: number;
  baseline_method: string;
  calculation_version: number;
  created_at: string;
  updated_at: string;
}

export interface ESGDailyMetric {
  id: string;
  shop_id: string;
  metric_date: string;
  active_bags_count: number;
  bags_in_circulation: number;
  bags_recovered_today: number;
  recovery_rate_percent: number;
  avg_reuse_cycles: number;
  single_use_packages_avoided: number;
  co2_saved_kg: number;
  fuel_saved_vnd: number;
  avg_cost_per_order_vnd: number;
  avg_cost_per_recovery_vnd: number;
  created_at: string;
}

// 10. Notifications & Audit
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  read_at?: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  shop_id?: string | null;
  actor_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
  ip_address?: string | null;
  created_at: string;
}

// 11. Deprecated Compatibility Aliases (for existing UI pages waiting for migration tasks)
/** @deprecated Replaced by RecoveryRequest in v2 */
export type PackagingPickup = RecoveryRequest;
/** @deprecated Replaced by RouteStopType in v2 */
export type StopType = RouteStopType;
/** @deprecated Replaced by RouteStopStatus in v2 */
export type StopStatus = RouteStopStatus;
/** @deprecated Replaced by RecoveryRequestStatus in v2 */
export type PickupStatus = RecoveryRequestStatus;
/** @deprecated Replaced by VoucherRedemptionStatus in v2 */
export type RedemptionStatus = VoucherRedemptionStatus;
