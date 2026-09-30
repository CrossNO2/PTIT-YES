"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Recycle,
  Award,
  Ticket,
  Leaf,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  RefreshCw,
  PlusCircle,
  TrendingUp,
  MapPin,
  Calendar,
  ChevronRight,
  ShieldCheck,
  Zap,
  PackageOpen,
  RotateCcw,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { CustomerMap, MapPickupPoint } from "@/components/CustomerMap";

interface CustomerDashboardData {
  customer_id: string;
  user_email: string;
  kpis: {
    total_points: number;
    points_earned: number;
    total_pickups: number;
    completed_pickups: number;
    active_pickups: number;
    active_vouchers: number;
    total_packaging_kg: number;
    co2_saved_kg: number;
  };
  map_pickups: MapPickupPoint[];
  recent_pickups: Array<{
    id: string;
    address: string;
    packaging_type: string;
    estimated_quantity_kg: number;
    verified_quantity_kg?: number;
    pickup_date: string;
    status: string;
    created_at: string;
  }>;
  recent_transactions: Array<{
    id: string;
    points_delta: number;
    transaction_type: string;
    description: string;
    created_at: string;
  }>;
  recent_vouchers: Array<{
    id: string;
    redemption_code: string;
    status: string;
    redeemed_at: string;
    vouchers?: {
      name: string;
      discount_value: number;
      expiry_date: string;
    };
  }>;
  analytics: {
    pickup_trend: Array<{ date: string; count: number; weight_kg: number }>;
    points_trend: Array<{ date: string; earned: number; redeemed: number }>;
  };
  sustainability: {
    packaging_collected_kg: number;
    co2_saved_kg: number;
    completed_actions: number;
    points_earned: number;
  };
}

export default function CustomerHomePage() {
  const [data, setData] = useState<CustomerDashboardData | null>(null);
  const [bags, setBags] = useState<any[]>([]);
  const [loadingBags, setLoadingBags] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = useCallback(async () => {
    try {
      setRefreshing(true);
      const [dashRes, bagsRes] = await Promise.all([
        fetch("/api/customer/dashboard"),
        fetch("/api/customer/bags"),
      ]);
      const json = await dashRes.json();
      if (json.success && json.data) {
        setData(json.data);
      }
      const bagsJson = await bagsRes.json();
      if (bagsJson.success && bagsJson.data) {
        setBags(bagsJson.data);
      }
    } catch {
      // Error handled gracefully
    } finally {
      setLoading(false);
      setLoadingBags(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const kpis = data?.kpis;
  const sustainability = data?.sustainability;
  const activePickupsList = (data?.map_pickups || []).filter((p) =>
    ["pending", "scheduled", "assigned", "collecting"].includes(p.status)
  );

  return (
    <div className="space-y-6">
      {/* SECTION 1 — PAGE HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Tổng Quan Khách Hàng
            </h1>
            <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold rounded-full">
              Khách Hàng Xanh
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Bảng điều khiển theo dõi lịch trình thu gom bao bì, tích điểm thưởng & giảm thải phát thải CO₂
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboard}
            disabled={refreshing}
            className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-2xs transition"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          <Link
            href="/customer/vouchers"
            className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-2xs transition flex items-center gap-2"
          >
            <Ticket className="w-3.5 h-3.5 text-slate-500" />
            <span>Đổi Voucher</span>
          </Link>

          <Link
            href="/customer/pickups/new"
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-2xs flex items-center gap-2 transition"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Tạo Yêu Cầu Thu Gom</span>
          </Link>
        </div>
      </div>

      {/* SECTION 2 — KPI CARDS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* KPI 1: Green Points Balance */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Số Dư Điểm Thưởng
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">
              {loading ? "..." : (kpis?.total_points || 0).toLocaleString()}{" "}
              <span className="text-xs font-normal text-emerald-600">Points</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Khả dụng đổi mã giảm giá
            </p>
          </div>
        </div>

        {/* KPI 2: Completed Pickups */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Đã Thu Gom
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">
              {loading ? "..." : kpis?.completed_pickups || 0}{" "}
              <span className="text-xs font-normal text-slate-500">lượt</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Hoàn thành trả lại bao bì
            </p>
          </div>
        </div>

        {/* KPI 3: Active / Pending Pickups */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Đang Xử Lý
            </span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">
              {loading ? "..." : kpis?.active_pickups || 0}{" "}
              <span className="text-xs font-normal text-slate-500">yêu cầu</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Đang chờ hoặc shipper đến nhận
            </p>
          </div>
        </div>

        {/* KPI 4: Active Vouchers */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Voucher Của Tôi
            </span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Ticket className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">
              {loading ? "..." : kpis?.active_vouchers || 0}{" "}
              <span className="text-xs font-normal text-slate-500">mã</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Voucher chưa sử dụng
            </p>
          </div>
        </div>

        {/* KPI 5: Total Packaging / CO2 Saved */}
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Túi PaaS Đã Trả
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Leaf className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-600">
              {loading ? "..." : kpis?.total_packaging_kg || 0}{" "}
              <span className="text-xs font-normal text-slate-500">túi</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Giảm ~{kpis?.co2_saved_kg || 0} kg CO₂
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 2.5 — PAAS BAGS IN CUSTODY */}
      <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackageOpen className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-slate-900 text-sm sm:text-base">
              Túi PaaS của bạn (PaaS Reusable Bags)
            </h2>
          </div>
          <Link
            href="/customer/pickups/new"
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
          >
            <span>Yêu cầu thu gom</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loadingBags ? (
          <div className="py-4 text-center text-xs text-slate-400">Đang tải túi PaaS...</div>
        ) : bags.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-100">
            Bạn hiện chưa giữ túi giao hàng PaaS nào. Túi tái sử dụng sẽ xuất hiện tại đây khi bạn nhận hàng từ các Shop đối tác của GreenBridge.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {bags.map((b) => (
              <div
                key={b.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-emerald-300 transition space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {b.bag_code}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      b.status === "with_customer"
                        ? "bg-emerald-100 text-emerald-800"
                        : b.status === "return_requested"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {b.status === "with_customer"
                      ? "Đang giữ túi"
                      : b.status === "return_requested"
                      ? "Đã hẹn thu gom"
                      : b.status}
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <div>
                    Loại: <span className="font-medium text-slate-800">{b.model_type}</span>
                  </div>
                  <div>
                    Số vòng tái sử dụng:{" "}
                    <strong className="text-emerald-700">{b.usage_count} chu kỳ</strong>
                  </div>
                  {b.order && (
                    <div>
                      Đơn hàng:{" "}
                      <span className="font-mono font-medium text-slate-800">
                        #{b.order.order_code}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                  {b.can_request_recovery ? (
                    <Link
                      href={`/customer/pickups/new?bag_id=${b.id}`}
                      className="w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs text-center transition flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Yêu cầu thu gom</span>
                    </Link>
                  ) : b.active_recovery ? (
                    <Link
                      href={`/customer/pickups/${b.active_recovery.id}`}
                      className="w-full py-1.5 px-3 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold text-xs text-center transition"
                    >
                      Xem tiến trình thu gom
                    </Link>
                  ) : (
                    <span className="text-[11px] text-slate-400">Đang được xử lý</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 3 & 4 — MAIN MAP AREA & RIGHT-SIDE SUMMARY PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Map (2 cols) */}
        <div className="lg:col-span-2">
          <CustomerMap pickups={data?.map_pickups || []} />
        </div>

        {/* Right-Side Summary Panel (1 col) */}
        <div className="space-y-4">
          {/* Pickup Status Breakdown Summary Card */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3">
            <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
              <Recycle className="w-4 h-4 text-emerald-600" />
              <span>Trạng Thái Thu Gom</span>
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                <span className="text-slate-600">Thu gom hoàn thành</span>
                <span className="font-bold text-emerald-700">
                  {kpis?.completed_pickups || 0} lượt
                </span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                <span className="text-slate-600">Đang chờ / Đang xử lý</span>
                <span className="font-bold text-amber-600">
                  {kpis?.active_pickups || 0} yêu cầu
                </span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                <span className="text-slate-600">Tổng yêu cầu đã tạo</span>
                <span className="font-bold text-slate-900">
                  {kpis?.total_pickups || 0} yêu cầu
                </span>
              </div>
            </div>
          </div>

          {/* Upcoming Active Pickup Card */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3">
            <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>Lịch Thu Gom Sắp Tới</span>
            </h3>

            {activePickupsList.length > 0 ? (
              <div className="p-3 bg-emerald-50/50 border border-emerald-200 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between font-semibold text-slate-900">
                  <span>{activePickupsList[0].packaging_type}</span>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-md uppercase">
                    {activePickupsList[0].status}
                  </span>
                </div>
                <p className="text-slate-600 text-[11px] line-clamp-2">
                  📍 {activePickupsList[0].address}
                </p>
                <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-emerald-100">
                  <span>Ngày hẹn: <b>{activePickupsList[0].pickup_date || "Đang xếp lịch"}</b></span>
                  <span>{activePickupsList[0].quantity_kg || 1} túi</span>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center text-xs text-slate-500">
                <p>Không có lịch thu gom nào đang hoạt động.</p>
                <Link
                  href="/customer/pickups/new"
                  className="mt-2 inline-block text-xs font-semibold text-emerald-600 hover:underline"
                >
                  + Đặt lịch ngay
                </Link>
              </div>
            )}
          </div>

          {/* Quick Real Insights */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-3">
            <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-600" />
              <span>Ghi Nhận Đóng Góp</span>
            </h3>

            <div className="space-y-2 text-xs text-slate-600">
              <div className="p-2.5 bg-slate-50 rounded-lg flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-slate-800 text-xs">Tác Động Môi Trường</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Mỗi 1 kg bao bì tái chế giúp tiết kiệm tương đương ~1.5 kg lượng phát thải khí nhà kính CO₂.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 5 — ANALYTICS / TREND CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pickup Trend Chart */}
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>Xu Hướng Thu Gom Bao Bì (kg)</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Khối lượng bao bì hoàn trả theo mốc thời gian
              </p>
            </div>
          </div>

          {data?.analytics.pickup_trend && data.analytics.pickup_trend.length > 0 ? (
            <div className="w-full h-56 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.analytics.pickup_trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748B" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748B" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#FFFFFF",
                      borderColor: "#E2E8F0",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="weight_kg" name="Bao bì (kg)" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="w-full h-48 bg-slate-50 border border-dashed border-slate-200 rounded-lg flex items-center justify-center p-4 text-center">
              <span className="text-xs text-slate-500">
                Chưa có đủ dữ liệu lịch sử thu gom để hiển thị biểu đồ.
              </span>
            </div>
          )}
        </div>

        {/* Green Points Trend Chart */}
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-600" />
                <span>Biến Động Điểm Thưởng Green Points</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Điểm tích lũy từ thu gom và điểm đã sử dụng đổi voucher
              </p>
            </div>
          </div>

          {data?.analytics.points_trend && data.analytics.points_trend.length > 0 ? (
            <div className="w-full h-56 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.analytics.points_trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748B" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748B" }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#FFFFFF",
                      borderColor: "#E2E8F0",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="earned"
                    name="Điểm tích lũy"
                    stroke="var(--color-primary)"
                    fill="var(--color-primary-soft)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="w-full h-48 bg-slate-50 border border-dashed border-slate-200 rounded-lg flex items-center justify-center p-4 text-center">
              <span className="text-xs text-slate-500">
                Chưa có đủ dữ liệu lịch sử điểm thưởng để hiển thị biểu đồ.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 6 — RECENT DATA SECTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Pickups Table */}
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider">
              Yêu Cầu Thu Gom Gần Đây
            </h3>
            <Link
              href="/customer/history"
              className="text-xs font-semibold text-emerald-600 hover:underline flex items-center gap-1"
            >
              Xem tất cả <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {data?.recent_pickups && data.recent_pickups.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wider">
                    <th className="py-2 px-3 font-semibold">Loại bao bì</th>
                    <th className="py-2 px-3 font-semibold">Ngày hẹn</th>
                    <th className="py-2 px-3 font-semibold">Số lượng</th>
                    <th className="py-2 px-3 font-semibold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {data.recent_pickups.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {p.packaging_type}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {p.pickup_date || (p.created_at ? p.created_at.split("T")[0] : "-")}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 font-mono">
                        {p.verified_quantity_kg || p.estimated_quantity_kg || 1} túi
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                            p.status === "completed"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-lg">
              Bạn chưa có yêu cầu thu gom nào.
            </div>
          )}
        </div>

        {/* Recent Points Ledger */}
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-semibold text-slate-900 text-xs uppercase tracking-wider">
              Nhật Ký Điểm Thưởng Gần Đây
            </h3>
            <Link
              href="/customer/points"
              className="text-xs font-semibold text-emerald-600 hover:underline flex items-center gap-1"
            >
              Xem tất cả <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {data?.recent_transactions && data.recent_transactions.length > 0 ? (
            <div className="space-y-2">
              {data.recent_transactions.map((tx) => {
                const isPositive = (tx.points_delta || 0) > 0;
                return (
                  <div
                    key={tx.id}
                    className="p-3 bg-slate-50 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-800">{tx.description}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {tx.created_at ? tx.created_at.split("T")[0] : ""} | {tx.transaction_type}
                      </div>
                    </div>
                    <div
                      className={`font-mono font-bold text-sm ${
                        isPositive ? "text-emerald-600" : "text-slate-600"
                      }`}
                    >
                      {isPositive ? `+${tx.points_delta}` : tx.points_delta}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-lg">
              Chưa có giao dịch điểm thưởng nào.
            </div>
          )}
        </div>
      </div>

      {/* SECTION 7 — SUSTAINABILITY IMPACT */}
      <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
            <Leaf className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 tracking-tight">Tác động bền vững của bạn</h2>
            <p className="text-xs text-slate-500">Chỉ hiển thị dữ liệu phát sinh từ các lượt thu gom đã hoàn tất.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs pt-1">
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="text-slate-500 text-[11px]">Bao bì PaaS đã hoàn trả</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">{sustainability?.packaging_collected_kg || 0} <span className="text-xs font-normal text-slate-400">túi</span></div>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="text-slate-500 text-[11px]">CO₂ tránh phát thải (ước tính)</span>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{sustainability?.co2_saved_kg || 0} <span className="text-xs font-normal text-slate-400">kg CO₂e</span></div>
            <div className="mt-1 text-[10px] text-slate-400">Hệ số minh họa: 1,5 kg CO₂e / túi bao bì tái sử dụng. Có thể thay bằng methodology chính thức sau.</div>
          </div>
          <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="text-slate-500 text-[11px]">Green Points đã tích lũy</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">{sustainability?.points_earned || 0} <span className="text-xs font-normal text-slate-400">pts</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
