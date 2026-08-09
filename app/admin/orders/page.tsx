"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Upload, RefreshCw, Eye, EyeOff, Search } from "lucide-react";
import { Order } from "@/types/database";
import { useShop } from "@/lib/hooks/use-shop-context";
import { notify } from "@/lib/ui/notify";

export default function AdminOrdersPage() {
  const { shopId } = useShop();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [search, setSearch] = useState("");
  const [unmaskedPhones, setUnmaskedPhones] = useState<Record<string, string>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Order Form
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [address, setAddress] = useState("");
  const [weightKg, setWeightKg] = useState("2.5");
  const [priority, setPriority] = useState("1");
  const [submitting, setSubmitting] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      let url = `/api/orders?shop_id=${shopId}&page=1&limit=50`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (dateFilter) url += `&delivery_date=${dateFilter}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setOrders(json.data || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [shopId, statusFilter, dateFilter, search]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleGeocode = async () => {
    try {
      const res = await fetch("/api/geocoding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error?.message || "Không tìm thấy tọa độ cho địa chỉ");
      }
      return { lat: Number(json.data.lat), lng: Number(json.data.lng) };
    } catch (error) {
      throw error instanceof Error ? error : new Error("Geocoding thất bại");
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const geo = await handleGeocode();
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: shopId,
          customer_name: customerName,
          customer_phone: customerPhone,
          address,
          lat: geo.lat,
          lng: geo.lng,
          delivery_date: new Date().toISOString().split("T")[0],
          time_slot_start: "08:00",
          time_slot_end: "12:00",
          weight_kg: parseFloat(weightKg),
          priority: parseInt(priority, 10),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowCreateModal(false);
        setCustomerName("");
        setCustomerPhone("");
        setAddress("");
        fetchOrders();
      } else {
        notify(json.error?.message || "Không thể tạo đơn hàng", "error");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Lỗi kết nối khi tạo đơn hàng", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleUnmask = async (orderId: string) => {
    if (unmaskedPhones[orderId]) {
      const copy = { ...unmaskedPhones };
      delete copy[orderId];
      setUnmaskedPhones(copy);
      return;
    }

    try {
      const res = await fetch(`/api/orders/${orderId}/unmask`, { method: "POST" });
      const json = await res.json();
      if (json.success && json.data?.customer_phone) {
        setUnmaskedPhones({ ...unmaskedPhones, [orderId]: json.data.customer_phone });
      } else {
        notify(json.error?.message || "Không có quyền giải mã SĐT này", "error");
      }
    } catch {
      notify("Lỗi giải mã SĐT", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Quản Lý Đơn Hàng & Điểm Giao</h1>
          <p className="text-xs text-slate-500 mt-1">Danh sách đơn hàng, geocoding địa chỉ & bảo mật thông tin PII</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-2xs flex items-center gap-2 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tạo Đơn Hàng Mới</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên khách, địa chỉ, mã đơn..."
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:outline-hidden focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <table className="w-full text-left text-xs text-slate-700">
          <thead className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200">
            <tr>
              <th className="px-6 py-3.5">Mã Đơn</th>
              <th className="px-6 py-3.5">Khách Hàng (Masked PII)</th>
              <th className="px-6 py-3.5">Địa Chỉ & Geocode</th>
              <th className="px-6 py-3.5">Khối Lượng</th>
              <th className="px-6 py-3.5">Trạng Thái</th>
              <th className="px-6 py-3.5 text-right">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
                  <span>Đang tải danh sách đơn hàng...</span>
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-400">
                  Chưa có đơn hàng nào trong CSDL.
                </td>
              </tr>
            ) : (
              orders.map((ord) => (
                <tr key={ord.id} className="hover:bg-slate-50/80 transition">
                  <td className="px-6 py-4 font-mono font-bold text-slate-900">{ord.order_code}</td>
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-900">{ord.customer_name}</div>
                    <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5 mt-0.5">
                      <span>{unmaskedPhones[ord.id] || ord.customer_phone}</span>
                      <button
                        onClick={() => handleToggleUnmask(ord.id)}
                        className="text-emerald-600 hover:text-emerald-700 transition"
                        title="Unmask SĐT (Ghi Audit Log)"
                      >
                        {unmaskedPhones[ord.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 max-w-xs truncate text-slate-600">
                    <div>{ord.address}</div>
                    <div className="text-[10px] font-mono text-slate-400">
                      ({ord.lat}, {ord.lng})
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono font-bold text-emerald-600">{ord.weight_kg} kg</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase font-mono">
                      {ord.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleToggleUnmask(ord.id)}
                      className="text-xs text-emerald-600 font-semibold hover:underline"
                    >
                      {unmaskedPhones[ord.id] ? "Ẩn SĐT" : "Unmask SĐT"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 text-xs shadow-xl">
            <h2 className="text-lg font-bold text-slate-900">Tạo Đơn Hàng Mới</h2>
            <form onSubmit={handleCreateOrder} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Tên khách hàng</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nguyễn Văn An"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Số điện thoại</label>
                <input
                  type="text"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="0912345678"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Địa chỉ giao hàng</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="100 Nguyễn Trãi, Thanh Xuân, Hà Nội"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Khối lượng (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Mức ưu tiên (1-5)</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-hidden focus:border-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-2xs"
                >
                  {submitting ? "Đang tạo..." : "Tạo Đơn Hàng"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}