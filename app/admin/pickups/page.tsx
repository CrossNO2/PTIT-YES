"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  PackageOpen,
  CheckCircle2,
  Clock3,
  Sparkles,
  Filter,
  Layers,
  ArrowRight,
  ShieldCheck,
  Truck,
  RotateCcw,
} from "lucide-react";
import { useShop } from "@/lib/hooks/use-shop-context";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { DecisionExplainabilityModal } from "@/components/admin/DecisionExplainabilityModal";
import { BagLifecycleModal } from "@/components/admin/BagLifecycleModal";

export default function AdminPickupsPage() {
  const { shopId, shopName } = useShop();
  const [pickups, setPickups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [strategyFilter, setStrategyFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  // Modals state
  const [selectedRecoveryForExplain, setSelectedRecoveryForExplain] = useState<any>(null);
  const [selectedBagForLifecycle, setSelectedBagForLifecycle] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setError("");
    try {
      let url = `/api/admin/pickups?shop_id=${encodeURIComponent(shopId)}`;
      if (statusFilter !== "all") url += `&status=${encodeURIComponent(statusFilter)}`;
      if (strategyFilter !== "all") url += `&strategy=${encodeURIComponent(strategyFilter)}`;
      if (dateFilter) url += `&date=${encodeURIComponent(dateFilter)}`;
      if (q) url += `&q=${encodeURIComponent(q)}`;

      const r = await fetch(url);
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error?.message || "Không tải được yêu cầu thu hồi túi PaaS");
      setPickups(j.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được yêu cầu thu hồi túi PaaS");
    } finally {
      setLoading(false);
    }
  }, [shopId, statusFilter, strategyFilter, dateFilter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = pickups.filter((p) =>
    ["requested", "planned", "assigned", "in_transit"].includes(p.status)
  ).length;
  const completedCount = pickups.filter((p) => p.status === "completed").length;
  const strategyACount = pickups.filter((p) => p.recovery_strategy === "strategy_a_merged").length;
  const strategyCCount = pickups.filter((p) => p.recovery_strategy === "strategy_c_dedicated").length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-[.18em] font-bold text-emerald-600">
              Reverse Logistics & Fleet Recovery
            </span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 border border-slate-200">
              GALM ROUTE OPTIMIZATION
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            Tổng quan yêu cầu thu hồi túi PaaS
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Danh sách yêu cầu thu hồi túi tái sử dụng, chiến lược phân bổ Strategy A/C và kết quả giải thích thuật toán.
          </p>
        </div>

        <button
          onClick={() => void load()}
          className="h-10 px-4 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 inline-flex items-center gap-2 shadow-2xs transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-600" : ""}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Top Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="flex justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                Đang xử lý / Thu hồi
              </div>
              <div className="mt-2 text-3xl font-bold text-amber-600">{activeCount}</div>
              <div className="text-[11px] text-slate-400 mt-1">Đang chờ hoặc shipper đang lấy</div>
            </div>
            <Clock3 className="w-5 h-5 text-amber-500" />
          </div>
        </Card>

        <Card>
          <div className="flex justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                Đã thu hồi hoàn tất
              </div>
              <div className="mt-2 text-3xl font-bold text-emerald-700">{completedCount}</div>
              <div className="text-[11px] text-slate-400 mt-1">Đã về Hub / Bàn giao xong</div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
        </Card>

        <Card>
          <div className="flex justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                Strategy A (Ghép tuyến)
              </div>
              <div className="mt-2 text-3xl font-bold text-emerald-700">{strategyACount}</div>
              <div className="text-[11px] text-slate-400 mt-1">Tối ưu chi phí & lượng khí thải</div>
            </div>
            <Sparkles className="w-5 h-5 text-emerald-600" />
          </div>
        </Card>

        <Card>
          <div className="flex justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                Strategy C (Chuyến riêng)
              </div>
              <div className="mt-2 text-3xl font-bold text-amber-600">{strategyCCount}</div>
              <div className="text-[11px] text-slate-400 mt-1">Khi không có tuyến ghép khả thi</div>
            </div>
            <Truck className="w-5 h-5 text-amber-500" />
          </div>
        </Card>
      </div>

      {/* Operational Filter Toolbar */}
      <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700">
          <Filter className="w-3.5 h-3.5 text-emerald-600" />
          <span>Bộ lọc điều hành (Operational Filters)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400 text-xs focus:bg-white focus:outline-hidden focus:border-emerald-500 transition"
              placeholder="Tìm mã túi, khách hàng, địa chỉ..."
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-medium focus:bg-white focus:outline-hidden focus:border-emerald-500 transition"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="requested">Yêu cầu mới (requested)</option>
            <option value="planned">Đã lập kế hoạch (planned)</option>
            <option value="assigned">Đã gán shipper (assigned)</option>
            <option value="in_transit">Đang thu hồi (in_transit)</option>
            <option value="completed">Đã hoàn tất (completed)</option>
          </select>

          {/* Strategy Filter */}
          <select
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-medium focus:bg-white focus:outline-hidden focus:border-emerald-500 transition"
          >
            <option value="all">Tất cả chiến lược GALM</option>
            <option value="strategy_a_merged">Strategy A (Ghép tuyến giao)</option>
            <option value="strategy_c_dedicated">Strategy C (Chuyến riêng)</option>
          </select>

          {/* Date Filter */}
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-xs font-medium focus:bg-white focus:outline-hidden focus:border-emerald-500 transition"
          />
        </div>
      </div>

      {/* Main Operational Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="font-bold text-slate-900 text-sm">Danh sách lượt thu hồi túi PaaS</div>
            <div className="text-xs text-slate-500 mt-0.5">{pickups.length} bản ghi tìm thấy</div>
          </div>
          <span className="text-[11px] text-slate-400">
            Nhấn vào hàng để xem phân tích chi tiết Explainable GALM
          </span>
        </div>

        {loading ? (
          <div className="p-14 text-center text-xs text-slate-400">Đang tải danh sách thu hồi...</div>
        ) : error ? (
          <div className="p-10 text-center text-red-700 bg-red-50 text-xs">{error}</div>
        ) : pickups.length === 0 ? (
          <div className="p-14 text-center text-xs text-slate-400">
            Không tìm thấy lượt thu hồi túi PaaS nào theo điều kiện lọc.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5 text-left">Mã lượt / Túi</th>
                  <th className="px-5 py-3.5 text-left">Khách hàng</th>
                  <th className="px-5 py-3.5 text-left">Địa chỉ thu gom</th>
                  <th className="px-5 py-3.5 text-left">Chiến lược GALM</th>
                  <th className="px-5 py-3.5 text-left">Shipper / Tuyến</th>
                  <th className="px-5 py-3.5 text-left">Khung giờ hẹn</th>
                  <th className="px-5 py-3.5 text-left">Trạng thái</th>
                  <th className="px-5 py-3.5 text-right">Lý do thuật toán</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pickups.map((p) => {
                  const isA = p.recovery_strategy === "strategy_a_merged";
                  const isC = p.recovery_strategy === "strategy_c_dedicated";
                  const decision = p.decision || null;

                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedRecoveryForExplain(p)}
                      className="hover:bg-slate-50/80 cursor-pointer transition"
                    >
                      <td className="px-5 py-4">
                        <div className="font-mono font-bold text-slate-900 flex items-center gap-1.5">
                          <PackageOpen className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{p.bag_code}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          REC-{p.id.slice(0, 8).toUpperCase()}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-800">{p.customer?.name || "Khách hàng"}</div>
                        <div className="text-[10px] text-slate-400">{p.customer?.phone || "SĐT bảo vệ"}</div>
                      </td>

                      <td className="px-5 py-4 text-slate-600 max-w-xs">
                        <div className="truncate font-medium">{p.address}</div>
                        {p.notes && (
                          <div className="text-[10px] text-slate-400 truncate italic mt-0.5">
                            Ghi chú: {p.notes}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            isA
                              ? "bg-emerald-100 text-emerald-800"
                              : isC
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {isA ? "Strategy A" : isC ? "Strategy C" : "Chờ phân tích"}
                        </span>
                        {decision?.estimated_distance_delta_km != null && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            +{Number(decision.estimated_distance_delta_km).toFixed(1)} km · +
                            {decision.estimated_duration_delta_mins || 0}p
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {p.assigned_shipper?.name ? (
                          <div>
                            <div className="font-medium text-slate-800">{p.assigned_shipper.name}</div>
                            {p.route?.id && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                RT-{p.route.id.slice(0, 8).toUpperCase()}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px]">— Chưa gán —</span>
                        )}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-slate-700">
                        <div>{p.pickup_date || "—"}</div>
                        <div className="text-[10px] text-slate-400">{p.time_slot}</div>
                      </td>

                      <td className="px-5 py-4">
                        <StatusPill status={p.status} />
                      </td>

                      <td className="px-5 py-4 text-right">
                        <span className="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold inline-flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-emerald-600" />
                          <span>Chi tiết AI</span>
                        </span>
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
