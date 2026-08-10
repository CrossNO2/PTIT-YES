"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Recycle,
  Award,
  Ticket,
  History,
  LogOut,
  Menu,
  X,
  User,
  Bell,
  Search,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ToastViewport } from "@/components/ui/toast-viewport";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLogo } from "@/components/brand-logo";

const navItems = [
  { name: "Tổng Quan Khách Hàng", href: "/customer/home", icon: Home },
  { name: "Trả Bao Bì Tái Chế", href: "/customer/pickups/new", icon: Recycle },
  { name: "Sổ Điểm Green Points", href: "/customer/points", icon: Award },
  { name: "Voucher Của Tôi", href: "/customer/vouchers", icon: Ticket },
  { name: "Lịch Sử Giao Dịch", href: "/customer/history", icon: History },
];

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="gb-app min-h-screen flex">
      {/* Desktop Sidebar (240px, white surface, right border) */}
      <aside className="hidden lg:flex flex-col w-60 border-r border-slate-200 bg-white shrink-0 sticky top-0 h-screen z-40">
        {/* Brand Header */}
        <div className="flex items-center px-4 h-16 border-b border-slate-100"><BrandLogo /></div>

        {/* Role Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/customer/home" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                  active
                    ? "bg-emerald-50 text-emerald-700 font-semibold shadow-2xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? "text-emerald-600" : "text-slate-400"
                  }`}
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer / Logout */}
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

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop Topbar */}
        <header className="hidden lg:flex h-16 bg-white border-b border-slate-200 px-8 items-center justify-between sticky top-0 z-30 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tìm kiếm yêu cầu thu gom, điểm thưởng, voucher..."
                className="w-80 bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:bg-white transition"
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs text-emerald-800 font-medium"><Recycle className="w-3.5 h-3.5 text-emerald-600" /><span>Cổng Khách Hàng Xanh</span></div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <ThemeToggle />
            <button className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition relative">
              <Bell className="w-4 h-4" />
              <span className="w-2 h-2 bg-emerald-500 rounded-full absolute top-1.5 right-1.5 ring-2 ring-white"></span>
            </button>

            <div className="h-4 w-px bg-slate-200"></div>

            <div className="flex items-center gap-2.5 cursor-pointer p-1.5 hover:bg-slate-50 rounded-lg transition">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shadow-2xs">
                KH
              </div>
              <div className="text-left">
                <div className="font-semibold text-slate-800 text-xs">Khách Hàng</div>
                <div className="text-[11px] text-slate-500">GreenBridge Member</div>
              </div>
            </div>
          </div>
        </header>

        {/* Mobile Header & Drawer */}
        <header className="lg:hidden flex items-center justify-between px-4 h-14 bg-white border-b border-slate-200">
          <BrandLogo compact />
          <div className="flex items-center gap-2"><ThemeToggle /><button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button></div>
        </header>

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

        {/* Main Content Canvas */}
        <main className="flex-1 p-6 lg:p-8 w-full max-w-[1680px] mx-auto overflow-y-auto">
          {children}
        </main>
      </div>
      <ToastViewport />
    </div>
  );
}