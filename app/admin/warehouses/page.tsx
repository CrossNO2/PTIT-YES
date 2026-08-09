"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, RefreshCw, MapPin } from "lucide-react";
import { Warehouse } from "@/types/database";
import { useShop } from "@/lib/hooks/use-shop-context";
import { notify } from "@/lib/ui/notify";

export default function AdminWarehousesPage() {
  const { shopId } = useShop();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchWarehouses = useCallback(async () => {
    if (!shopId) return;
    try {
      const res = await fetch(`/api/warehouses?shop_id=${shopId}`);
      const json = await res.json();
      if (json.success) setWarehouses(json.data || []);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const geoRes = await fetch("/api/geocoding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const geoJson = await geoRes.json();
      if (!geoRes.ok || !geoJson.success || !geoJson.data) {
        throw new Error(geoJson.error?.message || "Không tìm thấy tọa độ hợp lệ cho địa chỉ kho");
      }
      const lat = Number(geoJson.data.lat);
      const lng = Number(geoJson.data.lng);

      const res = await fetch("/api/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: shopId,
          name,
          address,
          lat,
          lng,
          is_default: warehouses.length === 0,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setName("");
        setAddress("");
        fetchWarehouses();
      } else {
        notify(json.error?.message || "Không thể tạo kho", "error");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Lỗi thêm kho xuất phát", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quản Lý Kho Xuất Phát</h1>
          <p className="text-xs text-slate-500 mt-1">Cấu hình điểm xuất phát và quay về cho thuật toán VRP</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-2xs flex items-center gap-2 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Thêm Kho Xuất Phát</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-2 text-center py-12 text-slate-400 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
            <span>Đang tải danh sách kho...</span>
          </div>
        ) : warehouses.length === 0 ? (
          <div className="col-span-2 text-center py-12 text-slate-400 text-xs bg-white border border-slate-200 rounded-xl">
            Chưa có kho xuất phát nào trong CSDL.
          </div>
        ) : (
          warehouses.map((wh) => (
            <div key={wh.id} className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 text-sm">{wh.name}</span>
                {wh.is_default && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Mặc Định
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-600 flex items-start gap-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>{wh.address}</span>
              </div>
              <div className="text-[11px] font-mono text-slate-400">Tọa độ: ({wh.lat}, {wh.lng})</div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 text-xs shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">Thêm Kho Xuất Phát Mới</h2>
            <form onSubmit={handleCreateWarehouse} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tên kho</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Kho Trung Tâm Đống Đa"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Địa chỉ đầy đủ</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="268 Đường Láng, Đống Đa, Hà Nội"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
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
                  {submitting ? "Đang lưu..." : "Lưu Kho"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}