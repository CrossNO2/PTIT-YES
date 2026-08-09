"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Vehicle, VehicleType } from "@/types/database";
import { useShop } from "@/lib/hooks/use-shop-context";
import { notify } from "@/lib/ui/notify";

export default function AdminVehiclesPage() {
  const { shopId } = useShop();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [name, setName] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("electric_motorbike");
  const [licensePlate, setLicensePlate] = useState("29A-123.45");
  const [capacityKg, setCapacityKg] = useState("50");
  const [co2PerKm, setCo2PerKm] = useState("0.05");
  const [fuelCostPerKm, setFuelCostPerKm] = useState("1000");
  const [submitting, setSubmitting] = useState(false);

  const fetchVehicles = useCallback(async () => {
    if (!shopId) return;
    try {
      const res = await fetch(`/api/vehicles?shop_id=${shopId}`);
      const json = await res.json();
      if (json.success) {
        setVehicles(json.data || []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: shopId,
          name,
          vehicle_type: vehicleType,
          license_plate: licensePlate,
          capacity_kg: parseFloat(capacityKg),
          co2_kg_per_km: parseFloat(co2PerKm),
          fuel_cost_vnd_per_km: parseFloat(fuelCostPerKm),
          status: "active",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setName("");
        fetchVehicles();
      } else {
        notify(json.error?.message || "Không thể tạo phương tiện");
      }
    } catch {
      notify("Lỗi tạo phương tiện");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quản Lý Đội Xe & Định Mức ESG</h1>
          <p className="text-xs text-slate-500 mt-1">Danh sách phương tiện, tải trọng & thông số hệ số phát thải CO₂</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-2xs flex items-center gap-2 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Thêm Phương Tiện</span>
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-3 text-center py-12 text-slate-400 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
            <span>Đang tải danh sách phương tiện...</span>
          </div>
        ) : vehicles.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-slate-400 text-xs bg-white border border-slate-200 rounded-xl">
            Chưa có phương tiện nào trong CSDL.
          </div>
        ) : (
          vehicles.map((v) => (
            <div key={v.id} className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 text-sm">{v.name}</span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {v.vehicle_type}
                </span>
              </div>
              <div className="text-xs text-slate-600 flex items-center justify-between pt-2 border-t border-slate-100">
                <span>Biển số:</span>
                <span className="font-mono font-bold text-slate-800">{v.license_plate}</span>
              </div>
              <div className="text-xs text-slate-600 flex items-center justify-between">
                <span>Tải trọng:</span>
                <span className="font-mono font-bold text-slate-800">{v.capacity_kg} kg</span>
              </div>
              <div className="text-xs text-slate-600 flex items-center justify-between">
                <span>Hệ số CO₂:</span>
                <span className="font-mono font-bold text-emerald-600">{v.co2_kg_per_km} kg/km</span>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 text-xs shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">Thêm Phương Tiện Mới</h2>
            <form onSubmit={handleCreateVehicle} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tên phương tiện</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Xe Máy Điện EcoBike 01"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Loại phương tiện</label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                >
                  <option value="electric_motorbike">Xe Máy Điện (Eco-friendly)</option>
                  <option value="motorbike">Xe Máy Xăng</option>
                  <option value="small_van">Xe Van Nhỏ</option>
                  <option value="light_truck">Xe Tải Nhẹ</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Biển số xe</label>
                <input
                  type="text"
                  required
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value)}
                  placeholder="29A-123.45"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Tải trọng (kg)</label>
                  <input
                    type="number"
                    required
                    value={capacityKg}
                    onChange={(e) => setCapacityKg(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">CO₂ (kg/km)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={co2PerKm}
                    onChange={(e) => setCo2PerKm(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-2xs"
                >
                  {submitting ? "Đang lưu..." : "Lưu Phương Tiện"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}