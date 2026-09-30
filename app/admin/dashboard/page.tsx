"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Sparkles,
  Package,
  RotateCcw,
  Route as RouteIcon,
  Truck,
  Users,
  RefreshCw,
  Layers,
  CloudSun,
  ShieldAlert,
  Info,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Compass,
} from "lucide-react";
import { useShop } from "@/lib/hooks/use-shop-context";
import { MetricCard } from "@/components/ui/metric-card";
import { RouteMap, RoutePoint } from "@/components/RouteMap";
import { StatusPill } from "@/components/ui/status-pill";
import { DecisionExplainabilityModal } from "@/components/admin/DecisionExplainabilityModal";
import { BagLifecycleModal } from "@/components/admin/BagLifecycleModal";

export default function OperationalControlCenterPage() {
  const { shopId, shopName } = useShop();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modals state
  const [selectedRecoveryForExplain, setSelectedRecoveryForExplain] = useState<any>(null);
  const [selectedBagForLifecycle, setSelectedBagForLifecycle] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/dashboard?shop_id=${encodeURIComponent(shopId)}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Không tải được trung tâm điều hành");
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được trung tâm điều hành");
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !data) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-10">
        <div className="font-semibold text-red-700">Không thể kết nối Control Center</div>
        <div className="mt-1 text-sm text-slate-500">{error}</div>
        <button
          onClick={() => void load()}
          className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const fleet = data?.fleet || {};
  const kpis = data?.kpis || {};
  const routesData = data?.routes || {};
  const recoveriesPipeline = data?.recoveries_pipeline || {};
  const galmContext = data?.galm_context || {};
  const mapPoints: RoutePoint[] = routesData.map_points || [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-[.18em] font-bold text-emerald-600">
              GALM Operational Control Center
            </span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 border border-slate-200">
              DEMO & PRODUCTION READY
            </span>
          </div>
          <h1 className="mt-1 text-2xl lg:text-3xl font-bold tracking-tight text-slate-950">
            Trung Tâm Điều Phối Logistics & Vòng Đời PaaS
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {shopName || "GreenBridge Main Shop"} · Giám sát thời gian thực từ hạm đội túi PaaS, thuật toán ghép tuyến Strategy A/C đến Hub tái sử dụng.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => void load()}
            className="h-10 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 inline-flex items-center gap-2 shadow-2xs transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-600" : ""}`} />
            <span>Làm mới</span>
          </button>
          <Link
            href="/admin/pickups"
            className="h-10 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-2 shadow-xs transition"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Tổng quan thu hồi</span>
          </Link>
          <Link
            href="/admin/hub"
            className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-2 shadow-xs transition"
          >
            <Package className="w-4 h-4" />
            <span>Vận hành Hub PaaS</span>
          </Link>
        </div>
      </div>

      {/* 1. BUSINESS KPI LAYER (Strictly Authentic, No Fake Numbers) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
            3 Chỉ số vận hành cốt lõi (Business KPIs)
          </div>
          <div className="text-[11px] text-slate-400">
            Dữ liệu thực tế từ cơ sở dữ liệu Supabase · Không suy diễn giá trị ảo
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* KPI 1: Cost per order */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold text-slate-500">
                1. Chi phí mỗi đơn hàng (Cost / Order)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200">
                N/A
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-slate-900">
                N/A
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-500 leading-relaxed space-y-1">
              <div>
                <strong>Lý do (Reason):</strong> Chưa có nguồn dữ liệu chi phí hoàn tất tin cậy cho từng đơn hàng (No reliable per-order fulfillment cost source).
              </div>
              <div className="text-slate-400">
                • <code>routes.estimated_cost_vnd</code> là chi phí ước tính ở cấp độ toàn tuyến, không thể quy kết tin cậy cho từng đơn hàng riêng lẻ.
              </div>
              <div className="text-slate-400">
                • Do đó chi phí mỗi đơn không được tính toán từ trường này và không hiển thị giá trị suy diễn giả định.
              </div>
            </div>
          </div>

          {/* KPI 2: Bag recovery rate */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold text-slate-500">
                2. Tỷ lệ thu hồi túi PaaS
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                VERIFIED LIVE DB
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-emerald-700">
                {loading ? "…" : kpis.recovery_rate?.display || "—"}
              </div>
              <span className="text-xs text-slate-400">
                ({kpis.recovery_rate?.completed_count || 0}/{kpis.recovery_rate?.total_count || 0} lượt)
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-500 leading-relaxed">
              <strong>Công thức:</strong> {kpis.recovery_rate?.formula}
              <div className="mt-1 text-slate-400">
                Tính trên chu trình thu hồi thực tế từ yêu cầu khách hàng về đến kho Hub.
              </div>
            </div>
          </div>

          {/* KPI 3: Actual reuse cycles per PaaS bag */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-semibold text-slate-500">
                3. Vòng tái sử dụng thực tế
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                AUDITED USAGE_COUNT
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold text-slate-950">
                {loading ? "…" : kpis.actual_reuse_cycles?.display || "—"}
              </div>
              <span className="text-xs text-slate-400">
                (Tổng {kpis.actual_reuse_cycles?.total_cycles || 0} vòng/{kpis.actual_reuse_cycles?.fleet_size || 0} túi)
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-500 leading-relaxed">
              <strong>Công thức:</strong> {kpis.actual_reuse_cycles?.formula}
              <div className="mt-1 text-slate-400">
                Bảo toàn semantics GB-002: tăng đúng 1 lần khi kiểm định Hub xác nhận tái sử dụng.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. PAAS BAG FLEET STATE PIPELINE BREAKDOWN (Closed-loop lifecycle with 10 unique states) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span>Phân bố hạm đội túi PaaS (Vòng đời tuần hoàn khép kín)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              10 unique lifecycle states in a closed loop: available &rarr; assigned &rarr; in_delivery &rarr; with_customer &rarr; return_requested &rarr; recovering &rarr; at_hub &rarr; inspection &rarr; maintenance &rarr; ready_for_reuse (&rarr; available).
            </p>
          </div>
          <div className="text-xs font-bold text-slate-900">
            Tổng quy mô: <span className="text-emerald-700 text-sm font-mono">{fleet.total_bags || 0}</span> túi PaaS
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-2.5 text-center">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[10px] uppercase font-bold text-slate-500">1. Trong kho</div>
            <div className="text-xl font-bold text-slate-900 mt-1">{fleet.available || 0}</div>
            <div className="text-[9px] text-slate-400 mt-0.5">available</div>
          </div>

          <div className="p-3 rounded-xl bg-blue-50/60 border border-blue-200">
            <div className="text-[10px] uppercase font-bold text-blue-800">2. Đang lưu hành</div>
            <div className="text-xl font-bold text-blue-900 mt-1">{fleet.in_circulation || 0}</div>
            <div className="text-[9px] text-blue-600 mt-0.5">circulation</div>
          </div>

          <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200">
            <div className="text-[10px] uppercase font-bold text-indigo-800">3. Khách giữ</div>
            <div className="text-xl font-bold text-indigo-900 mt-1">{fleet.with_customer || 0}</div>
            <div className="text-[9px] text-indigo-600 mt-0.5">with_customer</div>
          </div>

          <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200">
            <div className="text-[10px] uppercase font-bold text-amber-800">4. Chờ thu hồi</div>
            <div className="text-xl font-bold text-amber-900 mt-1">{fleet.awaiting_recovery || 0}</div>
            <div className="text-[9px] text-amber-600 mt-0.5">return_requested</div>
          </div>

          <div className="p-3 rounded-xl bg-orange-50/60 border border-orange-200">
            <div className="text-[10px] uppercase font-bold text-orange-800">5. Đang lấy</div>
            <div className="text-xl font-bold text-orange-900 mt-1">{fleet.recovering || 0}</div>
            <div className="text-[9px] text-orange-600 mt-0.5">recovering</div>
          </div>

          <div className="p-3 rounded-xl bg-yellow-50/60 border border-yellow-200">
            <div className="text-[10px] uppercase font-bold text-yellow-800">6. Tại kho Hub</div>
            <div className="text-xl font-bold text-yellow-900 mt-1">{fleet.at_hub || 0}</div>
            <div className="text-[9px] text-yellow-600 mt-0.5">at_hub</div>
          </div>

          <div className="p-3 rounded-xl bg-sky-50/60 border border-sky-200">
            <div className="text-[10px] uppercase font-bold text-sky-800">7. Kiểm định</div>
            <div className="text-xl font-bold text-sky-900 mt-1">{fleet.in_inspection || 0}</div>
            <div className="text-[9px] text-sky-600 mt-0.5">inspection</div>
          </div>

          <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-200">
            <div className="text-[10px] uppercase font-bold text-purple-800">8. Giặt sấy</div>
            <div className="text-xl font-bold text-purple-900 mt-1">{fleet.in_maintenance || 0}</div>
            <div className="text-[9px] text-purple-600 mt-0.5">maintenance</div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200">
            <div className="text-[10px] uppercase font-bold text-emerald-800">9. Đạt chuẩn</div>
            <div className="text-xl font-bold text-emerald-900 mt-1">{fleet.ready_for_reuse || 0}</div>
            <div className="text-[9px] text-emerald-600 mt-0.5">ready_for_reuse</div>
          </div>

          <div className="p-3 rounded-xl bg-red-50/60 border border-red-200">
            <div className="text-[10px] uppercase font-bold text-red-800">10. Hỏng/Loại</div>
            <div className="text-xl font-bold text-red-900 mt-1">{fleet.retired || 0}</div>
            <div className="text-[9px] text-red-600 mt-0.5">damaged/retired</div>
          </div>
        </div>
      </div>

      {/* 3. GALM INTERACTIVE MAP & ACTIVE ROUTE RUN */}
      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.7fr)_minmax(380px,.8fr)] gap-6">
        <div>
          <RouteMap points={mapPoints} height={530} />
        </div>

        {/* Right side operational panels */}
        <div className="space-y-5">
          {/* Active Dispatched Route Details */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <RouteIcon className="w-4 h-4 text-emerald-600" />
                <span>Tuyến Logistics Đang Chạy</span>
              </div>
              {routesData.active_route ? (
                <StatusPill status={routesData.active_route.status} />
              ) : (
                <span className="text-xs text-slate-400">Không có tuyến</span>
              )}
            </div>

            {routesData.active_route ? (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-slate-400 block">Mã tuyến</span>
                    <strong className="font-mono text-slate-800">
                      RT-{routesData.active_route.id.slice(0, 8).toUpperCase()}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Ngày vận hành</span>
                    <strong className="text-slate-800">{routesData.active_route.route_date}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Cự ly tối ưu</span>
                    <strong className="text-slate-800 font-mono">
                      {Number(routesData.active_route.optimized_distance_km || 0).toFixed(1)} km
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Thời gian ước tính</span>
                    <strong className="text-slate-800 font-mono">
                      {routesData.active_route.total_duration_mins || 0} phút
                    </strong>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-800">
                      Shipper: {routesData.active_route.profiles?.name || "Đã phân bổ"}
                    </div>
                    <div className="text-slate-400 text-[11px]">
                      Phương tiện: {routesData.active_route.vehicles?.name || "Xe máy điện / Van"} (
                      {routesData.active_route.vehicles?.license_plate || "—"})
                    </div>
                  </div>
                  <Link
                    href={`/admin/routes/${routesData.active_route.id}`}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1"
                  >
                    Chi tiết <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                Chưa có tuyến nào được điều phối hôm nay.
              </div>
            )}
          </div>

          {/* Environmental Context Signals (GALM Intelligence) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CloudSun className="w-4 h-4 text-sky-600" />
                <span className="font-bold text-slate-900 text-sm">GALM Environmental Signals</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200">
                SIMULATED
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px]">Thời tiết</span>
                <strong className="text-slate-800">{galmContext.weather_condition}</strong>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px]">Mật độ giao thông</span>
                <strong className="text-slate-800">{galmContext.traffic_level}</strong>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px]">Cảnh báo ngập</span>
                <strong className="text-slate-800">{galmContext.flood_risk}</strong>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 block text-[10px]">Mức rủi ro</span>
                <strong className="text-slate-800 capitalize">{galmContext.severity_level}</strong>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 italic">
              {galmContext.label} · Hỗ trợ thuật toán đánh giá độ khả thi ghép tuyến Strategy A.
            </div>
          </div>
        </div>
      </div>

      {/* 4. RECOVERY PIPELINE & RECENT GALM EXPLAINABLE DECISIONS */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Dòng sự kiện thu hồi & Quyết định giải thích (Explainable Stream)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Toàn bộ quyết định phân tích từ Deterministic Recovery Decision Engine (Strategy A / Strategy C).
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500">
              Strategy A: <strong className="text-emerald-700">{recoveriesPipeline.strategy_a || 0}</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500">
              Strategy C: <strong className="text-amber-700">{recoveriesPipeline.strategy_c || 0}</strong>
            </span>
            <Link
              href="/admin/pickups"
              className="ml-2 font-bold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1"
            >
              Xem tất cả ({recoveriesPipeline.total || 0}) <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Đang đồng bộ dữ liệu thu hồi...</div>
        ) : (recoveriesPipeline.recent || []).length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            Chưa có yêu cầu thu hồi túi PaaS nào được khởi tạo.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left">Mã túi PaaS</th>
                  <th className="px-5 py-3 text-left">Địa chỉ thu gom</th>
                  <th className="px-5 py-3 text-left">Chiến lược GALM</th>
                  <th className="px-5 py-3 text-left">Độ lệch cự ly/thời gian</th>
                  <th className="px-5 py-3 text-left">Trạng thái</th>
                  <th className="px-5 py-3 text-right">Giải thích thuật toán</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recoveriesPipeline.recent.map((rec: any) => {
                  const isA = rec.strategy === "strategy_a_merged";
                  const isC = rec.strategy === "strategy_c_dedicated";

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/70 transition">
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => setSelectedBagForLifecycle(rec.bag_id || rec.bag?.id)}
                          className="font-mono font-bold text-slate-900 hover:text-emerald-700 flex items-center gap-1.5"
                        >
                          <Package className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{rec.bag_code}</span>
                        </button>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {rec.usage_count} chu kỳ đã hoàn tất
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-slate-600 max-w-xs">
                        <div className="truncate">{rec.address}</div>
                        <div className="text-[10px] text-slate-400">Hẹn: {rec.pickup_date || "—"}</div>
                      </td>

                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            isA
                              ? "bg-emerald-100 text-emerald-800"
                              : isC
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {isA ? "Strategy A (Ghép tuyến)" : isC ? "Strategy C (Xe riêng)" : "Đang chờ"}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 text-slate-700 font-mono">
                        {rec.decision?.estimated_distance_delta_km != null ? (
                          <span>
                            +{Number(rec.decision.estimated_distance_delta_km).toFixed(1)} km · +
                            {rec.decision.estimated_duration_delta_mins || 0}p
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-5 py-3.5">
                        <StatusPill status={rec.status} />
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => setSelectedRecoveryForExplain(rec)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs inline-flex items-center gap-1.5 transition"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Explain</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Decision Explainability Modal */}
      {selectedRecoveryForExplain && (
        <DecisionExplainabilityModal
          recovery={selectedRecoveryForExplain}
          onClose={() => setSelectedRecoveryForExplain(null)}
          onViewBagLifecycle={(bagId) => {
            setSelectedRecoveryForExplain(null);
            setSelectedBagForLifecycle(bagId);
          }}
        />
      )}

      {/* Bag Lifecycle Timeline Modal */}
      {selectedBagForLifecycle && (
        <BagLifecycleModal
          bagId={selectedBagForLifecycle}
          onClose={() => setSelectedBagForLifecycle(null)}
        />
      )}
    </div>
  );
}
