"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  PackageOpen,
  ArrowRight,
  CheckCircle2,
  MapPin,
  CalendarDays,
  Clock3,
  Sparkles,
  Truck,
  RotateCcw,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

import { Suspense } from "react";

interface CustomerBag {
  id: string;
  bag_code: string;
  qr_code_hash: string;
  model_type: string;
  size_category: string;
  status: string;
  usage_count: number;
  max_cycles: number;
  order?: {
    id: string;
    order_code: string;
    delivery_date: string;
    status: string;
  } | null;
  active_recovery?: {
    id: string;
    status: string;
    recovery_strategy: string;
    pickup_date: string;
  } | null;
  can_request_recovery: boolean;
}

interface DecisionResult {
  recovery_request_id: string;
  bag_id: string;
  bag_code: string;
  order_id?: string | null;
  decision_id?: string | null;
  selected_strategy: string;
  decision_status: string;
  rationale?: {
    strategy?: string;
    reason_code?: string;
    explanation?: string;
    evaluated_metrics?: {
      evaluated_delta_km?: number;
      evaluated_delta_mins?: number;
      estimated_cost_delta_vnd?: number;
    };
  } | null;
  estimated_distance: number;
  estimated_duration: number;
  dedicated_task?: {
    id: string;
    task_status: string;
    estimated_distance_km: number;
    estimated_duration_mins: number;
  } | null;
  pickup_address: string;
  pickup_date: string;
}

function NewBagRecoveryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedBagId = searchParams.get("bag_id");

  const [bags, setBags] = useState<CustomerBag[]>([]);
  const [loadingBags, setLoadingBags] = useState(true);
  const [selectedBagId, setSelectedBagId] = useState<string>("");
  const [address, setAddress] = useState("");
  const [pickupDate, setPickupDate] = useState(new Date().toISOString().split("T")[0]);
  const [availableFrom, setAvailableFrom] = useState("08:00");
  const [availableUntil, setAvailableUntil] = useState("18:00");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [decisionResult, setDecisionResult] = useState<DecisionResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadBags() {
      try {
        setLoadingBags(true);
        const res = await fetch("/api/customer/bags");
        const json = await res.json();
        if (json.success && json.data) {
          setBags(json.data);
          const eligible = json.data.filter((b: CustomerBag) => b.can_request_recovery);
          if (preselectedBagId && eligible.some((b: CustomerBag) => b.id === preselectedBagId)) {
            setSelectedBagId(preselectedBagId);
          } else if (eligible.length > 0) {
            setSelectedBagId(eligible[0].id);
          }
        }
      } catch {
        setError("Không tải được danh sách túi PaaS của bạn");
      } finally {
        setLoadingBags(false);
      }
    }
    loadBags();
  }, [preselectedBagId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBagId) {
      setError("Vui lòng chọn túi PaaS bạn muốn hoàn trả");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/customer/recoveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bag_id: selectedBagId,
          pickup_address: address,
          pickup_date: pickupDate,
          time_slot_start: availableFrom,
          time_slot_end: availableUntil,
          notes,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.message || "Không thể tạo yêu cầu thu gom");
      }

      setDecisionResult(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi kết nối khi gửi yêu cầu thu gom");
    } finally {
      setSubmitting(false);
    }
  };

  if (decisionResult) {
    const isStrategyA = decisionResult.selected_strategy === "strategy_a_merged";
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <h1 className="mt-5 text-2xl font-bold text-slate-900">
            Yêu cầu thu gom túi PaaS thành công
          </h1>
          <p className="mt-2 text-sm text-slate-500 max-w-lg mx-auto">
            GALM phân tích và lựa chọn phương án thu hồi phù hợp cho túi <strong>{decisionResult.bag_code}</strong>.
          </p>

          {/* Explainable Decision Banner */}
          <div className="mt-6 p-5 bg-slate-50 border border-slate-200 rounded-xl text-left space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                Phương án điều phối (GALM Decision)
              </span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  isStrategyA
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-blue-100 text-blue-800"
                }`}
              >
                {isStrategyA ? "Strategy A — Ghép tuyến giao hàng" : "Strategy C — Thu gom chuyên biệt"}
              </span>
            </div>

            <div className="text-sm text-slate-800 font-medium">
              {decisionResult.rationale?.explanation ||
                (isStrategyA
                  ? "Túi sẽ được shipper ghé lấy cùng lúc với đơn hàng đang giao trên tuyến lân cận."
                  : "Hệ thống đã tạo nhiệm vụ thu gom chuyên biệt (Dedicated Recovery Task) để cử shipper đến nhận.")}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 text-xs text-slate-600 border-t border-slate-200">
              <div>
                <span className="text-slate-400">Khoảng cách phát sinh ước tính:</span>{" "}
                <strong className="text-slate-800 font-mono">
                  {decisionResult.estimated_distance?.toFixed(1) || "1.2"} km
                </strong>
              </div>
              <div>
                <span className="text-slate-400">Thời gian thu gom dự kiến:</span>{" "}
                <strong className="text-slate-800 font-mono">
                  ~{decisionResult.estimated_duration || 10} phút
                </strong>
              </div>
            </div>

            <div className="pt-2 text-xs text-slate-500">
              Mã yêu cầu thu gom:{" "}
              <span className="font-mono font-semibold text-slate-800">
                {decisionResult.recovery_request_id}
              </span>
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <button
              onClick={() => router.push(`/customer/pickups/${decisionResult.recovery_request_id}`)}
              className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition"
            >
              Xem chi tiết yêu cầu
            </button>
            <button
              onClick={() => router.push("/customer/home")}
              className="px-6 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition"
            >
              Về trang chủ
            </button>
          </div>
        </div>
      </div>
    );
  }

  const eligibleBags = bags.filter((b) => b.can_request_recovery);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6 pb-6 border-b border-slate-200">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600">
            PaaS Circular Logistics
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            Yêu cầu hoàn trả túi PaaS GreenBridge
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Chọn túi giao hàng tái sử dụng đang giữ để shipper đến thu hồi và hoàn tất chu kỳ tuần hoàn.
          </p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <RotateCcw className="w-5 h-5" />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loadingBags ? (
        <div className="p-12 text-center text-sm text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
          Đang tải danh sách túi PaaS của bạn...
        </div>
      ) : eligibleBags.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <PackageOpen className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Không có túi PaaS nào cần hoàn trả
          </h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Tất cả các túi tái sử dụng của bạn đã được lên lịch thu gom hoặc đã hoàn tất chu kỳ. Khi nhận đơn hàng mới với túi PaaS, bạn có thể tạo yêu cầu tại đây.
          </p>
          <div className="pt-2">
            <Link
              href="/customer/home"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition"
            >
              Về trang chủ
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
          <form
            onSubmit={handleSubmit}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5"
          >
            {/* Bag Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <PackageOpen className="w-4 h-4 text-emerald-600" />
                <span>Chọn túi PaaS hoàn trả</span>
              </label>
              <select
                value={selectedBagId}
                onChange={(e) => setSelectedBagId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              >
                {eligibleBags.map((bag) => (
                  <option key={bag.id} value={bag.id}>
                    {bag.bag_code} — {bag.model_type} ({bag.usage_count} chu kỳ đã dùng)
                    {bag.order ? ` [Đơn ${bag.order.order_code}]` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Pickup Address */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-600" />
                <span>Địa chỉ nhận thu gom</span>
              </label>
              <input
                required
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ví dụ: 123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh"
                className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Date & Time Window */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-emerald-600" />
                  <span>Ngày hẹn lấy</span>
                </label>
                <input
                  type="date"
                  required
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Clock3 className="w-4 h-4 text-emerald-600" />
                  <span>Từ giờ</span>
                </label>
                <input
                  type="time"
                  required
                  value={availableFrom}
                  onChange={(e) => setAvailableFrom(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Clock3 className="w-4 h-4 text-emerald-600" />
                  <span>Đến giờ</span>
                </label>
                <input
                  type="time"
                  required
                  value={availableUntil}
                  onChange={(e) => setAvailableUntil(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Ghi chú cho Shipper (Tùy chọn)
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ví dụ: Gửi bảo vệ tòa nhà hoặc gọi trước khi đến 15 phút..."
                className="w-full p-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>GALM đang phân tích phương án thu hồi...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Xác nhận yêu cầu hoàn trả túi PaaS</span>
                </>
              )}
            </button>
          </form>

          {/* Educational Sidebar */}
          <aside className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>Quy trình hoàn trả PaaS</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Mỗi túi PaaS GreenBridge được trang bị mã định danh bền vững. Sau khi hoàn trả, túi sẽ được đưa về Hub để kiểm tra chất lượng, làm sạch và khử khuẩn trước khi tiếp tục phục vụ đơn hàng mới.
              </p>
              <div className="space-y-2.5 pt-2 border-t border-slate-200 text-xs text-slate-600">
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                  <span>Khách hàng gửi yêu cầu thu hồi và chọn khung giờ hẹn.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                  <span>GALM phân tích và lựa chọn phương án thu hồi phù hợp (ghép tuyến hoặc điều phối riêng).</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</span>
                  <span>Shipper đến nhận túi và quét mã QR xác nhận.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">4</span>
                  <span>Túi về kho kiểm tra, hoàn tiền cọc & cộng Green Points thưởng.</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function NewBagRecoveryPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Đang tải biểu mẫu...</div>}>
      <NewBagRecoveryContent />
    </Suspense>
  );
}
