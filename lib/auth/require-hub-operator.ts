import { createClient } from "@/lib/supabase/server";
import { requireUser, requireShopMembership } from "@/lib/auth/require-user";
import { AppError } from "@/lib/errors";
import { ShopMemberRole } from "@/types/database";

const ALLOWED_HUB_ROLES: ShopMemberRole[] = ["owner", "admin", "dispatcher"];

export interface HubOperatorContext {
  userId: string;
  accountType: string;
  isPlatformAdmin: boolean;
  shopId?: string | null;
  memberRole?: ShopMemberRole | null;
}

/**
 * Enforces server-side authorization for Hub & Warehouse Operations.
 *
 * Access Rules:
 * 1. Must be authenticated and active.
 * 2. 'customer' role is unconditionally rejected (403 Forbidden).
 * 3. 'platform_admin' has universal operational scope across all hubs.
 * 4. 'shop_user' must be an active member of the shop owning the warehouse
 *    with an operational role ('owner' | 'admin' | 'dispatcher').
 *    Users with role 'shipper' or users from other shops are rejected (403 Forbidden).
 */
export async function requireHubOperator(
  warehouseId?: string | null,
  explicitShopId?: string | null
): Promise<HubOperatorContext> {
  const { user, profile } = await requireUser();
  const supabase = await createClient();

  // 1. Customers can never execute hub operations
  if (profile.account_type === "customer") {
    throw new AppError(
      "FORBIDDEN: Khách hàng không có quyền thực hiện thao tác quản lý kho bãi",
      "FORBIDDEN_HUB_ACCESS",
      403
    );
  }

  // 2. Platform Admin has universal hub access
  if (profile.account_type === "platform_admin") {
    return {
      userId: user.id,
      accountType: "platform_admin",
      isPlatformAdmin: true,
      shopId: explicitShopId || null,
      memberRole: null,
    };
  }

  // 3. Shop Users must belong to the operational scope of the hub
  if (profile.account_type === "shop_user") {
    let resolvedShopId = explicitShopId;

    if (!resolvedShopId && warehouseId) {
      const { data: warehouse, error } = await supabase
        .from("warehouses")
        .select("shop_id")
        .eq("id", warehouseId)
        .maybeSingle();

      if (error || !warehouse) {
        throw new AppError("NOT_FOUND: Không tìm thấy thông tin kho bãi", "WAREHOUSE_NOT_FOUND", 404);
      }
      resolvedShopId = warehouse.shop_id;
    }

    if (!resolvedShopId) {
      // If no warehouse or shop specified, verify user has active membership in at least one shop
      const { data: member } = await supabase
        .from("shop_members")
        .select("shop_id, member_role")
        .eq("user_id", user.id)
        .eq("status", "active")
        .in("member_role", ALLOWED_HUB_ROLES)
        .limit(1)
        .maybeSingle();

      if (!member) {
        throw new AppError(
          "FORBIDDEN: Bạn không có quyền vận hành kho bãi",
          "FORBIDDEN_HUB_OPERATOR",
          403
        );
      }

      return {
        userId: user.id,
        accountType: "shop_user",
        isPlatformAdmin: false,
        shopId: member.shop_id,
        memberRole: member.member_role as ShopMemberRole,
      };
    }

    const { member } = await requireShopMembership(resolvedShopId, ALLOWED_HUB_ROLES);

    return {
      userId: user.id,
      accountType: "shop_user",
      isPlatformAdmin: false,
      shopId: resolvedShopId,
      memberRole: member.member_role as ShopMemberRole,
    };
  }

  throw new AppError("FORBIDDEN: Không xác định được quyền hạn tài khoản", "FORBIDDEN_UNKNOWN_ROLE", 403);
}
