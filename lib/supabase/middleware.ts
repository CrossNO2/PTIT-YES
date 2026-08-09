import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase environment is not configured" }, { status: 500 });
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Protected route checks
  const isAdminRoute = pathname.startsWith("/admin");
  const isShipperRoute = pathname.startsWith("/shipper");
  const isCustomerRoute = pathname.startsWith("/customer");
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/register");

  // Allow access only if real Supabase user exists
  const isAuthorized = !!user;

  if (!isAuthorized && (isAdminRoute || isShipperRoute || isCustomerRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthorized) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .single();

    const { data: member } = await supabase
      .from("shop_members")
      .select("member_role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    const isCustomer = profile?.account_type === "customer";
    const isShipper = member?.member_role === "shipper";
    const isAdminStaff = profile?.account_type === "platform_admin" || (member?.member_role && member.member_role !== "shipper");

    if (isAuthRoute) {
      const url = request.nextUrl.clone();
      if (isCustomer) {
        url.pathname = "/customer/home";
      } else if (isShipper) {
        url.pathname = "/shipper/today";
      } else {
        url.pathname = "/admin/dashboard";
      }
      return NextResponse.redirect(url);
    }

    // Role-based route guard enforcement
    if (isAdminRoute && !isAdminStaff) {
      const url = request.nextUrl.clone();
      url.pathname = isShipper ? "/shipper/today" : "/customer/home";
      return NextResponse.redirect(url);
    }

    if (isShipperRoute && !isShipper && !isAdminStaff) {
      const url = request.nextUrl.clone();
      url.pathname = "/customer/home";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
