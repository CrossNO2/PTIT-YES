"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  PackageOpen,
  MapPin,
  CalendarDays,
  Clock3,
  QrCode,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Truck,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

interface RecoveryDetail {
  id: string;
  bag_id: string;
  bag?: {
    id: string;
    bag_code: string;
    qr_code_hash: string;
    model_type: string;
    status: string;
    usage_count: number;
    max_cycles: number;
  } | null;
  order?: {
    id: string;
    order_code: string;
    delivery_date: string;
  } | null;
  status: string;
  recovery_strategy: string;
  pickup_address: string;
  lat: number;
  lng: number;
  pickup_date: string;
  time_slot_start: string;
  time_slot_end: string;
  assigned_route_id?: string | null;
  picked_up_at?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  created_at: string;
  decision?: {
    id: string;
    selected_strategy: string;
    recommended_strategy: string;
    estimated_distance_delta_km: number;
    estimated_duration_delta_mins: number;
    rationale?: {
      explanation?: string;
      reason_code?: string;
    };
  } | null;
}

export default function CustomerRecoveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [recovery, setRecovery] = useState<RecoveryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDetail() {
      try {
        setLoading(true);
        const res = await fetch(`/api/customer/recoveries/${id}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error?.message || "Không tìm thấy yêu cầu thu gom");
        }
        setRecovery(json.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không tải được yêu cầu");
      } finally {
        setLoading(false);
      }
    }
    loadDetail();
  }, [id]);

  if (loading) {
    return (
      <div className="p-16 text-center text-sm text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
        Đang tải thông tin yêu cầu thu gom...
      </div>
    );
  }

  if (error || !recovery) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-lg mx-auto text-center space-y-4">
        <div className="text-red-700 font-semibold">{error || "Không tìm thấy yêu cầu"}</div>
        <Link
          href="/customer/home"
          className="inline-flex items-center gap-2 text-sm text-emerald-700 font-medium hover:underline"
        >
          ← Quay lại trang chủ
        </Link>
      </div>
    );
  }

  const isStrategyA = recovery.recovery_strategy === "strategy_a_merged";

  const statusSteps = [
    { key: "requested", label: "Đã yêu cầu", done: true },
    {
      key: "assigned",
      label: "Đã điều phối tuyến",
      done: ["assigned", "in_transit", "completed"].includes(recovery.status),
    },
    {
      key: "in_transit",
      label: "Shipper đang thu gom",
      done: ["in_transit", "completed"].includes(recovery.status),
    },
    {
      key: "completed",
      label: "Đã về Hub & kiểm định",
      done: recovery.status === "completed",
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Link
            href="/customer/home"
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-emerald-600">
              Chi tiết yêu cầu thu gom PaaS
            </div>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">
              REC-{recovery.id.slice(0, 8).toUpperCase()}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
              isStrategyA ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
            }`}
          >
            {isStrategyA ? "Strategy A — Ghép tuyến" : "Strategy C — Chuyến riêng"}
          </span>
          <span className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-800 text-xs font-semibold">
            Trạng thái: {recovery.status}
          </span>
        </div>
      </div>

      {/* Progress Timeline */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
          Tiến trình xử lý thu hồi
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statusSteps.map((step, idx) => (
            <div
              key={step.key}
              className={`p-3 rounded-xl border text-center transition ${
                step.done
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-slate-50 border-slate-200 text-slate-400"
              }`}
            >
              <div className="flex items-center justify-center gap-1.5 text-xs font-semibold">
                {step.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-slate-300 text-[10px] flex items-center justify-center text-slate-400">
                    {idx + 1}
                  </span>
                )}
                <span>{step.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
        {/* Main Details */}
        <div className="space-y-6">
          {/* PaaS Bag Identity Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold">
              <PackageOpen className="w-5 h-5 text-emerald-600" />
              <span>Thông tin túi PaaS tuần hoàn</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-xs text-slate-400">Mã định danh túi (Bag Code)</div>
                <div className="mt-1 font-mono font-bold text-slate-900 text-base">
                  {recovery.bag?.bag_code || "N/A"}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-xs text-slate-400">Loại túi & Số chu kỳ đã dùng</div>
                <div className="mt-1 font-semibold text-slate-900">
                  {recovery.bag?.model_type || "Túi tiêu chuẩn 25L"} ·{" "}
                  <span className="text-emerald-700">{recovery.bag?.usage_count ?? 0} chu kỳ</span>
                </div>
              </div>
            </div>

            {recovery.order && (
              <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                Gắn liền với đơn hàng đã giao:{" "}
                <strong className="text-slate-800 font-mono">{recovery.order.order_code}</strong>
              </div>
            )}
          </div>

          {/* Pickup Location & Window */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-slate-900 font-bold">
              <MapPin className="w-5 h-5 text-emerald-600" />
              <span>Địa điểm & Thời gian hẹn lấy</span>
            </div>

            <div className="space-y-3 text-sm">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="text-xs text-slate-400">Địa chỉ thu gom</div>
                <div className="mt-1 font-medium text-slate-800">{recovery.pickup_address}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-xs text-slate-400">Ngày hẹn lấy</div>
                  <div className="mt-1 font-semibold text-slate-800">
                    {new Date(recovery.pickup_date + "T00:00:00").toLocaleDateString("vi-VN")}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-xs text-slate-400">Khung giờ đón nhận</div>
                  <div className="mt-1 font-semibold text-slate-800">
                    {(recovery.time_slot_start || "08:00").slice(0, 5)} –{" "}
                    {(recovery.time_slot_end || "18:00").slice(0, 5)}
                  </div>
                </div>
              </div>

              {recovery.notes && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-xs text-slate-400">Ghi chú cho shipper</div>
                  <div className="mt-1 text-xs text-slate-700">{recovery.notes}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: Persistent QR & Decision Explanation */}
        <aside className="space-y-6">
          {/* Persistent Bag QR Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center space-y-3">
            <div className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-slate-500">
              <QrCode className="w-4 h-4 text-emerald-600" />
              <span>Mã QR bàn giao túi</span>
            </div>
            <p className="text-xs text-slate-500">
              Đưa mã này hoặc mã túi cho shipper khi đến nhận để xác thực bàn giao.
            </p>

            <div className="w-36 h-36 mx-auto bg-slate-50 border-2 border-dashed border-emerald-300 rounded-xl flex flex-col items-center justify-center p-2">
              <QrCode className="w-20 h-20 text-slate-800" />
              <div className="mt-1 font-mono text-[10px] font-bold text-slate-700 truncate max-w-full">
                {recovery.bag?.bag_code}
              </div>
            </div>

            <div className="font-mono text-xs font-semibold text-slate-800 bg-slate-100 py-1.5 px-3 rounded-lg truncate">
              {recovery.bag?.bag_code || recovery.id}
            </div>
          </div>

          {/* AI Decision Rationale Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-emerald-700">
              <Sparkles className="w-4 h-4" />
              <span>Giải trình Điều Phối GALM</span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {recovery.decision?.rationale?.explanation ||
                (isStrategyA
                  ? "Túi được ghép vào tuyến giao hàng lân cận để tối ưu khí thải CO2 và chi phí vận hành."
                  : "Chuyến thu gom riêng biệt được phân bổ để đảm bảo thời gian hoàn trả đúng hẹn.")}
            </p>

            {recovery.decision && (
              <div className="pt-2 border-t border-slate-200 text-xs text-slate-500 space-y-1">
                <div>
                  Detour:{" "}
                  <strong className="text-slate-800 font-mono">
                    +{recovery.decision.estimated_distance_delta_km?.toFixed(1) || "1.0"} km
                  </strong>
                </div>
                <div>
                  Duration:{" "}
                  <strong className="text-slate-800 font-mono">
                    ~{recovery.decision.estimated_duration_delta_mins || 10} phút
                  </strong>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
