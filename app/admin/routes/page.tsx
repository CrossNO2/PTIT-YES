"use client";

import { useState, useEffect, useCallback } from "react";
import { Truck, RefreshCw, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Route } from "@/types/database";
import { useShop } from "@/lib/hooks/use-shop-context";

interface RouteWithRelations extends Route {
  warehouses?: { name: string };
  vehicles?: { name: string; vehicle_type: string };
}

export default function AdminRoutesPage() {
  const { shopId } = useShop();
  const [routes, setRoutes] = useState<RouteWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoutes = useCallback(async () => {
    if (!shopId) return;
    try {
      const res = await fetch(`/api/routes?shop_id=${shopId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setRoutes(json.data);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    fetchRoutes();
  }, [fetchRoutes]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quản Lý Tuyến Đường Đã Tối Ưu</h1>
          <p className="text-xs text-slate-500 mt-1">Danh sách các tuyến giao hàng & thu gom đã phê duyệt thực tế trong CSDL</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
            <span>Đang tải danh sách tuyến đường...</span>
          </div>
        ) : routes.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Chưa có tuyến đường nào trong CSDL.
          </div>
        ) : (
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Mã Tuyến</th>
                <th className="px-6 py-3.5">Kho & Phương Tiện</th>
                <th className="px-6 py-3.5">Ngày Tuyến</th>
                <th className="px-6 py-3.5">Naive vs Optimized</th>
                <th className="px-6 py-3.5">Trạng Thái</th>
                <th className="px-6 py-3.5 text-right">Chi Tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {routes.map((r) => {
                const savedKm = (r.naive_distance_km || 0) - (r.optimized_distance_km || 0);
                return (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">
                      RT-{r.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{r.warehouses?.name || "Kho Xuất Phát"}</div>
                      <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                        <Truck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{r.vehicles?.name || "Phương tiện"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-600">{r.route_date}</td>
                    <td className="px-6 py-4 font-mono">
                      <span className="line-through text-slate-400 mr-2">{r.naive_distance_km} km</span>
                      <span className="text-emerald-600 font-bold">{r.optimized_distance_km} km</span>
                      {savedKm > 0 && (
                        <div className="text-[11px] text-emerald-600 font-medium">Tiết kiệm: +{savedKm.toFixed(1)} km</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase font-mono">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/admin/routes/${r.id}`}
                        className="text-emerald-600 hover:text-emerald-700 font-semibold inline-flex items-center gap-0.5"
                      >
                        <span>Xem</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
