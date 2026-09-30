"use client";

import { useEffect, useState } from "react";
import {
  X,
  Layers,
  AlertTriangle,
  History,
  RefreshCw,
} from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";

interface BagLifecycleModalProps {
  bagId: string;
  onClose: () => void;
}

const LIFECYCLE_STEPS = [
  { key: "available", label: "1. Sẵn sàng", sub: "Trong kho" },
  { key: "assigned", label: "2. Gán đơn", sub: "Đóng gói" },
  { key: "in_delivery", label: "3. Đang giao", sub: "Shipper" },
  { key: "with_customer", label: "4. Khách giữ", sub: "Custody" },
  { key: "return_requested", label: "5. Báo trả", sub: "Thu hồi" },
  { key: "recovering", label: "6. Đang lấy", sub: "Shipper lấy" },
  { key: "at_hub", label: "7. Về Hub", sub: "Tiếp nhận" },
  { key: "inspection", label: "8. Kiểm định", sub: "Đánh giá" },
  { key: "maintenance", label: "9. Giặt sấy", sub: "Khử khuẩn" },
  { key: "ready_for_reuse", label: "10. Đạt chuẩn", sub: "+1 cycle" },
];

export function BagLifecycleModal({ bagId, onClose }: BagLifecycleModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const fetchBag = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/admin/bags/${encodeURIComponent(bagId)}`);
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error?.message || "Không tải được thông tin túi");
        if (!cancelled) setData(json.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Lỗi tải thông tin túi");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchBag();
    return () => {
      cancelled = true;
    };
  }, [bagId]);

  const bag = data?.bag || null;
  const events: any[] = data?.lifecycle_events || [];

  const currentStepIndex = LIFECYCLE_STEPS.findIndex((s) => s.key === bag?.status);
  const isDamagedOrRetired = bag?.status === "damaged" || bag?.status === "retired";

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-emerald-700">
                PaaS Physical Asset Tracking
              </div>
              <h2 className="text-base font-bold text-slate-900">
                Vòng đời & Lịch sử túi: {bag?.bag_code || "..."}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto text-sm">
          {loading ? (
            <div className="py-16 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
              Đang truy xuất thông tin túi và sổ cái bất biến (immutable ledger)...
            </div>
          ) : error ? (
            <div className="p-6 text-center text-red-700 bg-red-50 rounded-xl">{error}</div>
          ) : !bag ? (
            <div className="py-12 text-center text-slate-500">Không tìm thấy túi PaaS</div>
          ) : (
            <>
              {/* Bag Master Metadata Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Mã túi / Serial</span>
                  <strong className="font-mono text-sm text-slate-900">{bag.bag_code}</strong>
                  <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5" title={bag.qr_code_hash}>
                    QR: {bag.qr_code_hash?.slice(0, 14)}...
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Trạng thái hiện tại</span>
                  <div className="mt-1">
                    <StatusPill status={bag.status} />
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-1 capitalize">Độ bền: {bag.condition}</span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Số chu kỳ tái sử dụng</span>
                  <div className="mt-0.5 text-base font-bold text-emerald-700">
                    {bag.usage_count} <span className="text-xs font-normal text-slate-500">/ {bag.max_cycles} vòng</span>
                  </div>
                  <span className="text-[10px] text-slate-400">Tăng khi chứng nhận tái sử dụng</span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Đối tượng giữ (Custody)</span>
                  <div className="mt-0.5 font-semibold text-slate-800 capitalize">
                    {bag.current_holder_type}: {bag.holder_profile?.name || "Kho Hub"}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Vị trí: {bag.current_location_type}
                  </div>
                </div>
              </div>

              {/* Closed-loop Lifecycle with 10 unique states */}
              <div className="space-y-3">
                <div className="text-xs uppercase tracking-wider font-bold text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span>Vòng lặp khép kín với 10 trạng thái vòng đời duy nhất (Closed-loop lifecycle with 10 unique states)</span>
                  {isDamagedOrRetired && (
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                      Rẽ nhánh hỏng / loại bỏ ({bag.status})
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  Chu trình khép kín: available &rarr; assigned &rarr; in_delivery &rarr; with_customer &rarr; return_requested &rarr; recovering &rarr; at_hub &rarr; inspection &rarr; maintenance &rarr; ready_for_reuse &rarr; available (trạng thái available xuất hiện ở đầu và kết thúc chu trình tái sử dụng).
                </div>

                {/* Step indicator */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {LIFECYCLE_STEPS.map((step, idx) => {
                    const isCurrent = bag.status === step.key;
                    const isPast = currentStepIndex >= 0 && idx < currentStepIndex;

                    return (
                      <div
                        key={step.key}
                        className={`p-2 rounded-lg border text-center transition ${
                          isCurrent
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                            : isPast
                            ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                            : "bg-slate-50 text-slate-400 border-slate-200"
                        }`}
                      >
                        <div className="text-[10px] font-bold tracking-tight line-clamp-1">{step.label}</div>
                        <div className={`text-[9px] mt-0.5 ${isCurrent ? "text-emerald-100" : "text-slate-400"}`}>
                          {step.sub}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Damaged / Retired Branch Indicator */}
                {isDamagedOrRetired && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>
                      Túi đã chuyển sang trạng thái <strong>{bag.status}</strong> do hư hỏng không thể sửa chữa hoặc đã hết tuổi thọ chu kỳ tối đa ({bag.max_cycles} vòng).
                    </span>
                  </div>
                )}
              </div>

              {/* Immutable Lifecycle Events Ledger from bag_lifecycle_events */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                  <div className="font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-emerald-600" />
                    <span>Nhật ký biến cố bất biến (bag_lifecycle_events)</span>
                  </div>
                  <span className="text-slate-400">{events.length} sự kiện</span>
                </div>

                {events.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
                    Chưa có sự kiện nào được ghi nhận cho túi này.
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {events.map((ev, i) => (
                      <div key={ev.id || i} className="relative">
                        <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-emerald-600 ring-4 ring-white" />
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 font-mono">
                              {ev.event_type}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(ev.created_at).toLocaleString("vi-VN")}
                            </span>
                          </div>

                          <div className="text-slate-600 flex items-center gap-2">
                            <span>Từ: <code className="bg-white px-1 rounded border">{ev.from_status || "none"}</code></span>
                            <span>&rarr;</span>
                            <span>Đến: <code className="bg-emerald-100 text-emerald-800 px-1 rounded font-bold">{ev.to_status}</code></span>
                          </div>

                          {ev.location_notes && (
                            <div className="text-[11px] text-slate-500">{ev.location_notes}</div>
                          )}

                          {ev.actor?.name && (
                            <div className="text-[10px] text-slate-400">
                              Người thực hiện: {ev.actor.name} ({ev.actor.account_type})
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
