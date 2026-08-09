"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Navigation, QrCode, History, LogOut, Leaf, Bell, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ToastViewport } from "@/components/ui/toast-viewport";

const navItems = [
  { name: "Tuyến Hôm Nay", href: "/shipper/today", icon: Navigation },
  { name: "Quét QR Thu Gom", href: "/shipper/scan", icon: QrCode },
  { name: "Lịch Sử Giao Nhận", href: "/shipper/history", icon: History },
];

export default function ShipperLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      <aside className="hidden lg:flex w-60 shrink-0 border-r border-slate-200 bg-white h-screen sticky top-0 flex-col z-40">
        <div className="h-16 px-6 border-b border-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs"><Leaf className="w-5 h-5" /></div>
          <div>
            <div className="text-sm font-bold text-slate-900 leading-none">GreenBridge AI</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider font-semibold text-emerald-600">Shipper Workspace</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/shipper/today" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition ${active ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
                <Icon className={`w-4 h-4 ${active ? "text-emerald-600" : "text-slate-400"}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-100">
          <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition">
            <LogOut className="w-4 h-4" /> Đăng xuất
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="hidden md:flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input readOnly placeholder="Tìm tuyến, đơn giao, điểm thu gom..." className="w-72 bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-600" />
            </div>
            <span className="px-3 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium">Workspace giao nhận</span>
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <button aria-label="Thông báo" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"><Bell className="w-4 h-4" /></button>
            <div className="w-px h-5 bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">SP</div>
              <div className="hidden sm:block">
                <div className="text-xs font-semibold text-slate-800">Shipper</div>
                <div className="text-[11px] text-slate-500">GreenBridge Delivery</div>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 p-6 lg:p-8 w-full max-w-[1680px] mx-auto">{children}</main>
      </div>
      <ToastViewport />
    </div>
  );
}