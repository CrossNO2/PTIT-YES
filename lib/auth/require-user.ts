import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { UserAccountType, ShopMemberRole } from "@/types/database";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AppError("UNAUTHENTICATED: Bạn chưa đăng nhập", "UNAUTHENTICATED", 401);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    throw new AppError("NOT_FOUND: Hồ sơ người dùng không tồn tại", "PROFILE_NOT_FOUND", 404);
  }

  if (!profile.is_active) {
    throw new AppError("FORBIDDEN: Tài khoản của bạn đã bị vô hiệu hóa", "ACCOUNT_DISABLED", 403);
  }

  return { user, profile };
}

export async function requireAccountType(allowedTypes: UserAccountType[]) {
  const { user, profile } = await requireUser();

  if (!allowedTypes.includes(profile.account_type)) {
    throw new AppError("FORBIDDEN: Bạn không có quyền truy cập tính năng này", "FORBIDDEN_ACCOUNT_TYPE", 403);
  }

  return { user, profile };
}

export async function requireShopMembership(shopId: string, allowedRoles?: ShopMemberRole[]) {
  const { user, profile } = await requireUser();
  const supabase = await createClient();

  const { data: member } = await supabase
    .from("shop_members")
    .select("*")
    .eq("shop_id", shopId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!member) {
    throw new AppError("FORBIDDEN: Bạn không thuộc shop này", "FORBIDDEN_SHOP_MEMBERSHIP", 403);
  }

  if (allowedRoles && !allowedRoles.includes(member.member_role)) {
    throw new AppError("FORBIDDEN: Vai trò của bạn trong shop không đủ quyền thực hiện thao tác này", "FORBIDDEN_SHOP_ROLE", 403);
  }

  return { user, profile, member };
}
