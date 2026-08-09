"use client";

import { useState, useEffect, useMemo } from "react";
import { Route as RouteIcon, Play, AlertCircle, CheckCircle2, Truck, MapPin, RefreshCw, ChevronRight } from "lucide-react";
import { OptimizationOutput } from "@/lib/optimization/types";
import { Warehouse } from "@/types/database";
import { useShop } from "@/lib/hooks/use-shop-context";
import { notify } from "@/lib/ui/notify";
import { RouteMap, RoutePoint } from "@/components/RouteMap";

export default function AdminOptimizePage() {
  const { shopId } = useShop();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split("T")[0]);
  const [optimizing, setOptimizing] = useState(false);
  const [output, setOutput] = useState<OptimizationOutput | null>(null);
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [mapRouteIndex, setMapRouteIndex] = useState(0);
  const mapPoints = useMemo<RoutePoint[]>(() => {
    const route = output?.routes?.[mapRouteIndex];
    if (!route) return [];
    return route.stops.map((stop, index) => ({
      id: stop.orderId || stop.pickupId || `warehouse-${index}`,
      label: stop.orderCode || (stop.stopType === "pickup" ? `Pickup ${stop.pickupId?.slice(0, 8) ?? ""}` : "Kho GreenBridge"),
      lat: Number(stop.lat),
      lng: Number(stop.lng),
      kind: stop.stopType,
    }));
  }, [output, mapRouteIndex]);

  useEffect(() => {
    if (!shopId) return;
    const fetchWarehouses = async () => {
      try {
        const res = await fetch(`/api/warehouses?shop_id=${shopId}`);
        const json = await res.json();
        if (json.success && json.data.length > 0) {
          setWarehouses(json.data);
          setSelectedWarehouseId(json.data[0].id);
        }
      } catch {
        // fallback
      }
    };
    fetchWarehouses();
  }, [shopId]);

  const handleRunOptimization = async () => {
    if (!selectedWarehouseId || !shopId) {
      notify("Vui lòng chọn kho xuất phát");
      return;
    }

    setOptimizing(true);
    setOutput(null);
    setApproved(false);

    try {
      const res = await fetch("/api/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: shopId,
          warehouse_id: selectedWarehouseId,
          delivery_date: deliveryDate,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setOutput(json.data);
      } else {
        notify(json.error?.message || "Không thể thực hiện tối ưu tuyến", "error");
      }
    } catch {
      notify("Lỗi kết nối máy chủ tối ưu", "error");
    } finally {
      setOptimizing(false);
    }
  };

  const handleApproveRoute = async () => {
    if (!output || !output.routes || output.routes.length === 0 || !shopId) return;
    setApproving(true);
    try {
      const res = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: shopId,
          warehouse_id: selectedWarehouseId,
          route_date: deliveryDate,
          optimization_version: 1,
          routes: output.routes,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setApproved(true);
        notify("Tuyến đường đã được lưu và phê duyệt thành công trong CSDL!", "success");
      } else {
        notify(json.error?.message || "Không thể lưu tuyến đường vào CSDL", "error");
      }
    } catch {
      notify("Lỗi phê duyệt tuyến đường", "error");
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Thuật Toán Tối Ưu Tuyến Đường (VRP)</h1>
          <p className="text-xs text-slate-500 mt-1">
            Greedy VRP + Time Windows + Vehicle Capacity + 2-Opt Heuristic Optimization
          </p>
        </div>
      </div>

      {/* Control Panel */}
      <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Kho xuất phát
            </label>
            <select
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
            >
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.name} ({wh.address})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Ngày chạy tuyến
            </label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={handleRunOptimization}
              disabled={optimizing}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg shadow-2xs flex items-center justify-center gap-2 transition disabled:opacity-50 text-xs"
            >
              {optimizing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang tính toán 2-Opt VRP...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Chạy Thuật Toán Tối Ưu</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Results View */}
      {output && (
        <div className="space-y-6">
          {/* KPI Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-xs text-slate-500">Baseline Cự Ly (Naive)</span>
              <div className="text-xl font-bold text-slate-700 mt-1">{output.naiveDistanceKm} km</div>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-xs text-slate-500">Cự Ly Tối Ưu</span>
              <div className="text-xl font-bold text-emerald-600 mt-1">{output.optimizedDistanceKm} km</div>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-xs text-slate-500">Km Tiết Kiệm</span>
              <div className="text-xl font-bold text-emerald-600 mt-1">+{output.totalKmSaved} km</div>
            </div>
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-xs text-slate-500">CO₂ Giảm Thải</span>
              <div className="text-xl font-bold text-slate-900 mt-1">{output.estimatedCo2SavedKg} kg</div>
            </div>
          </div>

          {/* Interactive Map Container */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>Bản Đồ Tuyến Đường Tối Ưu</span>
              </h2>
              {approved ? (
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-full flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Đã Duyệt & Lưu CSDL
                </span>
              ) : (
                <button
                  onClick={handleApproveRoute}
                  disabled={approving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-lg shadow-2xs transition"
                >
                  {approving ? "Đang lưu..." : "Phê Duyệt Tuyến & Lưu CSDL"}
                </button>
              )}
            </div>

            {output.routes.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {output.routes.map((route, index) => (
                  <button key={route.vehicleId} onClick={() => setMapRouteIndex(index)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap ${mapRouteIndex === index ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    Tuyến {index + 1} · {route.vehicleName}
                  </button>
                ))}
              </div>
            )}
            {mapPoints.length >= 2 ? (
              <RouteMap points={mapPoints} height={430} />
            ) : (
              <div className="h-72 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-500">Chưa đủ tọa độ để hiển thị bản đồ tuyến.</div>
            )}

            {/* Routes List */}
            <div className="space-y-3 pt-2">
              <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider">Danh Sách Tuyến Chi Tiết</h3>
              {output.routes.map((r, rIdx) => (
                <div key={rIdx} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                  <div className="flex items-center justify-between font-medium">
                    <span className="text-emerald-700 flex items-center gap-2 font-semibold">
                      <Truck className="w-4 h-4 text-emerald-600" /> {r.vehicleName} ({r.vehicleType})
                    </span>
                    <span className="text-slate-500 font-mono">
                      {r.totalDistanceKm} km | ~{r.totalDurationMins}m | Tải trọng: {r.totalWeightKg} kg
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {r.stops.map((s, sIdx) => (
                      <div key={sIdx} className="flex items-center gap-1">
                        <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-mono ${
                          s.stopType === "warehouse"
                            ? "bg-slate-200 text-slate-800 font-bold"
                            : "bg-emerald-100 text-emerald-800 font-medium"
                        }`}>
                          #{s.sequenceIndex} {s.orderCode || "Kho"}
                        </span>
                        {sIdx < r.stops.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Unassigned Orders Alert */}
            {output.unassignedOrders.length > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2 text-xs">
                <h4 className="font-semibold text-amber-800 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>Đơn Chưa Xếp Tuyến ({output.unassignedOrders.length})</span>
                </h4>
                <div className="space-y-1">
                  {output.unassignedOrders.map((u, uIdx) => (
                    <div key={uIdx} className="text-slate-700 flex items-center justify-between">
                      <span className="font-mono text-amber-900 font-semibold">{u.orderCode}</span>
                      <span className="text-slate-500">{u.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}