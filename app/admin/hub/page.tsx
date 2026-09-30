"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PackageCheck,
  RefreshCw,
  Search,
  Sparkles,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ArrowRight,
  ClipboardList,
} from "lucide-react";
import { useShop } from "@/lib/hooks/use-shop-context";
import { notify } from "@/lib/ui/notify";

interface HubBag {
  id: string;
  bag_code: string;
  qr_code_hash: string;
  status: string;
  condition: string;
  model_type: string;
  size_category: string;
  usage_count: number;
  max_cycles: number;
  current_warehouse_id: string;
  last_inspected_at?: string | null;
  last_cleaned_at?: string | null;
  updated_at: string;
  warehouses?: {
    id: string;
    name: string;
  } | null;
}

export default function AdminHubOperationsPage() {
  const { shopId } = useShop();
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [bags, setBags] = useState<HubBag[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  // Inspection Modal State
  const [inspectBag, setInspectBag] = useState<HubBag | null>(null);
  const [inspectResult, setInspectResult] = useState<"passed" | "needs_wash" | "repaired" | "degraded" | "scrapped">("passed");
  const [inspectAction, setInspectAction] = useState<"inspected_ok" | "washed_sanitized" | "stitched_repaired" | "scrapped">("inspected_ok");
  const [inspectNotes, setInspectNotes] = useState("");

  const loadWarehouses = useCallback(async () => {
    if (!shopId) return;
    try {
      const res = await fetch(`/api/warehouses?shop_id=${encodeURIComponent(shopId)}`);
      const json = await res.json();
      if (json.success && json.data?.length > 0) {
        setWarehouses(json.data);
        if (!selectedWarehouseId) {
          setSelectedWarehouseId(json.data[0].id);
        }
      }
    } catch {
      // Ignored
    }
  }, [shopId, selectedWarehouseId]);

  const loadBags = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/api/admin/hub/bags?";
      if (selectedWarehouseId) url += `warehouse_id=${encodeURIComponent(selectedWarehouseId)}&`;
      if (statusFilter !== "all") url += `status=${encodeURIComponent(statusFilter)}`;

      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data) {
        setBags(json.data);
      }
    } catch {
      notify("Không tải được danh sách túi tại Hub", "error");
    } finally {
      setLoading(false);
    }
  }, [selectedWarehouseId, statusFilter]);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    loadBags();
  }, [loadBags]);

  // Actions
  const handleStartInspection = async (bag: HubBag) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/hub/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bag_id: bag.id,
          warehouse_id: bag.current_warehouse_id || selectedWarehouseId,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Không thể chuyển trạng thái kiểm định");
      notify(`Túi ${bag.bag_code} đã chuyển sang khu vực kiểm định`, "success");
      await loadBags();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Thất bại", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteInspection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectBag) return;

    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/hub/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bag_id: inspectBag.id,
          warehouse_id: inspectBag.current_warehouse_id || selectedWarehouseId,
          result: inspectResult,
          action: inspectAction,
          notes: inspectNotes,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Không thể hoàn tất kiểm định");

      if (json.data?.cycle_completed) {
        notify(`Túi ${inspectBag.bag_code} đạt chuẩn! usage_count tăng lên ${json.data.new_usage_count}`, "success");
      } else {
        notify(`Túi ${inspectBag.bag_code} chuyển sang trạng thái ${json.data?.new_status}`, "success");
      }

      setInspectBag(null);
      setInspectNotes("");
      await loadBags();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Thất bại", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleReturnToStock = async (bag: HubBag) => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/hub/return-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bag_id: bag.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Không thể nhập lại kho khả dụng");
      notify(`Túi ${bag.bag_code} đã nhập lại kho khả dụng (available) để đóng đơn hàng mới!`, "success");
      await loadBags();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Thất bại", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const atHubCount = bags.filter((b) => b.status === "at_hub").length;
  const inspectionCount = bags.filter((b) => b.status === "inspection").length;
  const maintenanceCount = bags.filter((b) => b.status === "maintenance").length;
  const readyCount = bags.filter((b) => b.status === "ready_for_reuse").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold text-emerald-600">
            Hub & Depot Operations
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            Xử lý túi PaaS sau thu hồi
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Quy trình khép kín: Tiếp nhận tại kho Hub → Kiểm định chất lượng → Giặt sấy/Khử khuẩn → Chứng nhận tái sử dụng → Nhập kho.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {warehouses.length > 0 && (
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-800"
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => loadBags()}
            className="h-10 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {/* KPI Pipeline Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          onClick={() => setStatusFilter("at_hub")}
          className={`p-4 rounded-2xl border cursor-pointer transition ${
            statusFilter === "at_hub"
              ? "bg-amber-50 border-amber-300 ring-2 ring-amber-400"
              : "bg-white border-slate-200 hover:border-amber-200"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700">1. Tại kho Hub</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{atHubCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">Chờ kiểm định chất lượng</div>
        </div>

        <div
          onClick={() => setStatusFilter("inspection")}
          className={`p-4 rounded-2xl border cursor-pointer transition ${
            statusFilter === "inspection"
              ? "bg-blue-50 border-blue-300 ring-2 ring-blue-400"
              : "bg-white border-slate-200 hover:border-blue-200"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">2. Đang kiểm định</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{inspectionCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">Đánh giá độ bền & phân loại</div>
        </div>

        <div
          onClick={() => setStatusFilter("maintenance")}
          className={`p-4 rounded-2xl border cursor-pointer transition ${
            statusFilter === "maintenance"
              ? "bg-purple-50 border-purple-300 ring-2 ring-purple-400"
              : "bg-white border-slate-200 hover:border-purple-200"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-purple-700">3. Giặt sấy & Bảo dưỡng</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{maintenanceCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">Khử khuẩn theo chuẩn y tế</div>
        </div>

        <div
          onClick={() => setStatusFilter("ready_for_reuse")}
          className={`p-4 rounded-2xl border cursor-pointer transition ${
            statusFilter === "ready_for_reuse"
              ? "bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400"
              : "bg-white border-slate-200 hover:border-emerald-200"
          }`}
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">4. Sẵn sàng tái sử dụng</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{readyCount}</div>
          <div className="text-[11px] text-slate-500 mt-1">Đã tăng usage_count, chờ nhập kho</div>
        </div>
      </div>

      {/* Bag List Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-emerald-600" />
            <span className="font-semibold text-sm text-slate-900">Danh sách túi PaaS tại kho</span>
            <span className="text-xs text-slate-400">({bags.length} túi)</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                statusFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              Tất cả
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">Đang tải danh sách túi...</div>
        ) : bags.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Không có túi PaaS nào ở trạng thái lọc này.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left">Mã túi</th>
                  <th className="px-5 py-3 text-left">Loại & Kích cỡ</th>
                  <th className="px-5 py-3 text-left">Số chu kỳ</th>
                  <th className="px-5 py-3 text-left">Tình trạng</th>
                  <th className="px-5 py-3 text-left">Trạng thái</th>
                  <th className="px-5 py-3 text-right">Thao tác vận hành</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bags.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-5 py-4">
                      <div className="font-mono font-bold text-slate-900">{b.bag_code}</div>
                      <div className="text-[10px] text-slate-400 font-mono truncate max-w-xs">
                        QR: {b.qr_code_hash.slice(0, 12)}...
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      <div>{b.model_type}</div>
                      <div className="text-xs text-slate-400">{b.size_category}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-emerald-700">{b.usage_count} chu kỳ</div>
                      <div className="text-[10px] text-slate-400">Tối đa {b.max_cycles} vòng</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {b.condition}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                          b.status === "at_hub"
                            ? "bg-amber-100 text-amber-800"
                            : b.status === "inspection"
                            ? "bg-blue-100 text-blue-800"
                            : b.status === "maintenance"
                            ? "bg-purple-100 text-purple-800"
                            : b.status === "ready_for_reuse"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {b.status === "at_hub" && (
                        <button
                          onClick={() => handleStartInspection(b)}
                          disabled={actionLoading}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
                        >
                          Bắt đầu kiểm định
                        </button>
                      )}

                      {b.status === "inspection" && (
                        <button
                          onClick={() => {
                            setInspectBag(b);
                            setInspectResult("passed");
                            setInspectAction("inspected_ok");
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition"
                        >
                          Đánh giá & Chứng nhận
                        </button>
                      )}

                      {b.status === "maintenance" && (
                        <button
                          onClick={() => {
                            setInspectBag(b);
                            setInspectResult("passed");
                            setInspectAction("washed_sanitized");
                          }}
                          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition"
                        >
                          Hoàn tất giặt sấy
                        </button>
                      )}

                      {b.status === "ready_for_reuse" && (
                        <button
                          onClick={() => handleReturnToStock(b)}
                          disabled={actionLoading}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition flex items-center gap-1.5 ml-auto"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          <span>Nhập kho khả dụng</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspection Modal */}
      {inspectBag && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="font-bold text-slate-900">
                Chứng nhận chất lượng túi: {inspectBag.bag_code}
              </div>
              <span className="text-xs text-slate-500">Chu kỳ hiện tại: {inspectBag.usage_count}</span>
            </div>

            <form onSubmit={handleCompleteInspection} className="space-y-4 text-sm">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-slate-600">
                  Kết quả kiểm định (Inspection Outcome)
                </label>
                <select
                  value={inspectResult}
                  onChange={(e) => setInspectResult(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800"
                >
                  <option value="passed">Đạt chuẩn tái sử dụng (Passed) — Tăng 1 usage_count</option>
                  <option value="needs_wash">Cần giặt / khử khuẩn thêm (Needs Wash)</option>
                  <option value="repaired">Cần khâu vá / sửa chữa (Repaired)</option>
                  <option value="degraded">Hư hỏng nhẹ (Degraded)</option>
                  <option value="scrapped">Rách nát / Loại bỏ (Scrapped)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-slate-600">
                  Hành động bảo dưỡng (Maintenance Action)
                </label>
                <select
                  value={inspectAction}
                  onChange={(e) => setInspectAction(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800"
                >
                  <option value="inspected_ok">Đã kiểm định đạt chuẩn (Inspected OK)</option>
                  <option value="washed_sanitized">Đã giặt sấy khử khuẩn (Washed & Sanitized)</option>
                  <option value="stitched_repaired">Đã khâu may gia cố (Stitched & Repaired)</option>
                  <option value="scrapped">Hủy túi (Scrapped)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-slate-600">
                  Ghi chú kiểm định
                </label>
                <textarea
                  rows={2}
                  value={inspectNotes}
                  onChange={(e) => setInspectNotes(e.target.value)}
                  placeholder="Ghi chú tình trạng quai đeo, khóa dán..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs text-slate-800"
                />
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                {inspectResult === "passed"
                  ? "✓ Khi chọn 'Passed', túi sẽ chuyển sang 'ready_for_reuse' và số chu kỳ usage_count được ghi nhận tăng đúng 1 lần."
                  : "⚠ Khi chưa 'Passed', túi chuyển sang khu vực bảo dưỡng/sửa chữa và usage_count KHÔNG tăng."}
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setInspectBag(null)}
                  className="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition disabled:opacity-50"
                >
                  Xác nhận kết quả
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
