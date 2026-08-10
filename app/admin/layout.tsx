"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Route as RouteIcon,
  Users,
  Truck,
  Recycle,
  BarChart3,
  FileCheck2,
  Settings,
  LogOut,
  Menu,
  X,
  Building2,
  Bell,
  Search,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ShopProvider, useShop } from "@/lib/hooks/use-shop-context";
import { ToastViewport } from "@/components/ui/toast-viewport";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLogo } from "@/components/brand-logo";

const navItems = [
  { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { name: "Đơn Hàng", href: "/admin/orders", icon: Package },
  { name: "Tối Ưu Tuyến VRP", href: "/admin/optimize", icon: RouteIcon },
  { name: "Tuyến Đường", href: "/admin/routes", icon: RouteIcon },
  { name: "Kho Xuất Phát", href: "/admin/warehouses", icon: Building2 },
  { name: "Đội Xe Logistics", href: "/admin/vehicles", icon: Truck },
  { name: "Shipper & Ca Làm", href: "/admin/shippers", icon: Users },
  { name: "Bao Bì Thu Gom", href: "/admin/pickups", icon: Recycle },
  { name: "Báo Cáo ESG", href: "/admin/esg", icon: BarChart3 },
  { name: "Audit Log", href: "/admin/audit", icon: FileCheck2 },
  { name: "Cấu Hình Hệ Thống", href: "/admin/settings", icon: Settings },
];

function AdminHeader() {
  const { shopName } = useShop();

  return (
    <header className="hidden lg:flex h-16 bg-white border-b border-slate-200 px-8 items-center justify-between sticky top-0 z-30 shadow-xs">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm kiếm đơn hàng, tuyến đường, kho..."
            className="w-72 bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 focus:bg-white transition"
          />
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs text-emerald-800 font-medium">
          <Building2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>{shopName || "GreenBridge Main Shop"}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <ThemeToggle />
        <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition relative">
          <Bell className="w-4 h-4" />
          <span className="w-2 h-2 bg-emerald-500 rounded-full absolute top-1.5 right-1.5 ring-2 ring-white"></span>
        </button>

        <div className="h-4 w-px bg-slate-200"></div>

        <div className="flex items-center gap-2.5 cursor-pointer p-1.5 hover:bg-slate-50 rounded-lg transition">
          <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
            AD
          </div>
          <div className="text-left">
            <div className="font-semibold text-slate-800 text-xs">Quản Trị Viên</div>
            <div className="text-[11px] text-slate-500">admin@greenbridge.vn</div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </div>
      </div>
    </header>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <ShopProvider>
      <div className="gb-app min-h-screen flex">
        {/* Desktop Sidebar (240px width, white, border-right) */}
        <aside className="hidden lg:flex flex-col w-60 border-r border-slate-200 bg-white shrink-0 sticky top-0 h-screen z-40">
          {/* Logo Header */}
          <div className="flex items-center px-4 h-16 border-b border-slate-100">
            <BrandLogo />
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href !== "/admin/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition ${
                    active
                      ? "bg-emerald-50 text-emerald-700 font-semibold shadow-2xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? "text-emerald-600" : "text-slate-400"}`} />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Logout footer */}
          <div className="p-3 border-t border-slate-100">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition"
            >
              <LogOut className="w-4 h-4 text-slate-400" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Header Mobile */}
          <header className="lg:hidden flex items-center justify-between px-4 h-14 bg-white border-b border-slate-200">
            <BrandLogo compact />
            <div className="flex items-center gap-2"><ThemeToggle /><button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button></div>
          </header>

          {/* Mobile Drawer */}
          {mobileOpen && (
            <div className="lg:hidden bg-white border-b border-slate-200 p-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Icon className="w-4 h-4 text-emerald-600" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50"
              >
                <LogOut className="w-4 h-4" />
                <span>Đăng xuất</span>
              </button>
            </div>
          )}

          {/* Top Header Desktop */}
          <AdminHeader />

          {/* Page Content Container */}
          <main className="flex-1 p-6 lg:p-8 max-w-[1680px] w-full mx-auto overflow-y-auto">{children}</main>
        </div>
        <ToastViewport />
      </div>
    </ShopProvider>
  );
}