"use client";

import {
  Sparkles,
  X,
  Compass,
  Clock,
  Truck,
  ShieldCheck,
  CloudSun,
  AlertTriangle,
  Layers,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface DecisionExplainabilityModalProps {
  recovery: any;
  onClose: () => void;
  onViewBagLifecycle?: (bagId: string) => void;
}

export function DecisionExplainabilityModal({
  recovery,
  onClose,
  onViewBagLifecycle,
}: DecisionExplainabilityModalProps) {
  if (!recovery) return null;

  const decision = recovery.decision || null;
  const isStrategyA = recovery.recovery_strategy === "strategy_a_merged" || decision?.selected_strategy === "strategy_a_merged";
  const isStrategyC = recovery.recovery_strategy === "strategy_c_dedicated" || decision?.selected_strategy === "strategy_c_dedicated";

  const rationale = decision?.rationale || {};
  const evidence = rationale.evidence || {};
  const context = decision?.context_signals_snapshot || {};
  const dedicatedTask = evidence.dedicated_task || null;
  const rejectionReasons = evidence.rejection_reasons || [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-bold text-emerald-700">
                Explainable GALM Decision
              </div>
              <h2 className="text-base font-bold text-slate-900">
                Phân tích thuật toán: {recovery.bag_code || "Túi PaaS"}
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

        {/* Engine Banner */}
        <div className="px-6 py-3 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Engine: <strong>Deterministic Recovery Decision Engine</strong> (GALM Rule & VRP Heuristics)
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-emerald-200/60 font-semibold text-[10px] text-emerald-900">
            AUDITABLE
          </span>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-sm">
          {/* Strategy Outcome Header */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-semibold text-slate-500">
                Chiến lược được chọn
              </span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold ${
                  isStrategyA
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : isStrategyC
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {isStrategyA
                  ? "STRATEGY A — Ghép tuyến giao hàng sẵn có"
                  : isStrategyC
                  ? "STRATEGY C — Chuyến thu hồi riêng biệt"
                  : "Chờ phân tích"}
              </span>
            </div>

            <div className="text-xs text-slate-600">
              Mã lý do (Reason Code):{" "}
              <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono font-semibold text-slate-900">
                {rationale.reason_code || (isStrategyA ? "MERGED_DELIVERY_ROUTE" : isStrategyC ? "DEDICATED_FALLBACK" : "PENDING")}
              </code>
            </div>

            <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
              {rationale.summary || (isStrategyA
                ? "Túi được ghép tối ưu vào tuyến giao hàng đang chạy của shipper, đảm bảo độ lệch cự ly và thời gian nằm trong ngưỡng cho phép."
                : "Không tìm thấy tuyến giao hàng phù hợp hoặc vượt ngưỡng cự ly; hệ thống chuyển sang nhiệm vụ thu hồi chuyên biệt.")}
            </div>
          </div>

          {/* Metrics & Deltas (Strategy A or Strategy C) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Compass className="w-3.5 h-3.5 text-emerald-600" />
                <span>Độ lệch cự ly</span>
              </div>
              <div className="mt-1.5 text-lg font-bold text-slate-900">
                +{Number(decision?.estimated_distance_delta_km || evidence.estimated_detour_km || 0).toFixed(1)} km
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Ngưỡng: &le; {evidence.threshold_distance_km || 5} km
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Thời gian phát sinh</span>
              </div>
              <div className="mt-1.5 text-lg font-bold text-slate-900">
                +{decision?.estimated_duration_delta_mins || evidence.estimated_extra_minutes || 0} phút
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Ngưỡng: &le; {evidence.threshold_duration_mins || 30} phút
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Truck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Khả dụng tải trọng</span>
              </div>
              <div className="mt-1.5 text-lg font-bold text-emerald-700">
                {isStrategyA ? "ĐẠT CHUẨN" : "CẦN XE RIÊNG"}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Sức chứa thùng xe & ca làm
              </div>
            </div>
          </div>

          {/* Detailed Strategy A Breakdown */}
          {isStrategyA && (
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/30 space-y-2">
              <div className="text-xs uppercase tracking-wider font-bold text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Chi tiết ghép tuyến Strategy A
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <div>
                  <span className="text-slate-500">Shipper phụ trách:</span>{" "}
                  <strong className="text-slate-800">
                    {recovery.assigned_shipper?.name || recovery.route?.shipper_id || "Shipper được chỉ định"}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Tuyến ghép:</span>{" "}
                  <strong className="font-mono text-slate-800">
                    {recovery.assigned_route_id ? `RT-${recovery.assigned_route_id.slice(0, 8).toUpperCase()}` : "Tuyến hiện tại"}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Nguồn tính cự ly:</span>{" "}
                  <strong className="text-slate-800">{evidence.distance_source || "ROAD_NETWORK_OSRM"}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Chi phí phát sinh ước tính:</span>{" "}
                  <strong className="text-slate-800">
                    {Math.round(decision?.estimated_cost_delta_vnd || 0).toLocaleString("vi-VN")} ₫
                  </strong>
                </div>
              </div>
            </div>
          )}

          {/* Detailed Strategy C Breakdown */}
          {isStrategyC && (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-3">
              <div className="text-xs uppercase tracking-wider font-bold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Nhiệm vụ thu hồi chuyên biệt Strategy C
              </div>

              {/* Reasons why Strategy A failed */}
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-700">
                  Lý do Strategy A không khả thi:
                </div>
                {rejectionReasons.length > 0 ? (
                  <ul className="space-y-1">
                    {rejectionReasons.map((reason: string, idx: number) => (
                      <li key={idx} className="flex items-start gap-1.5 text-xs text-slate-600">
                        <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-slate-600">
                    Không có tuyến giao hàng nào cùng khung giờ và khu vực trong ngày hẹn hoặc khoảng cách vòng vượt quá ngưỡng tối ưu 5.0 km.
                  </div>
                )}
              </div>

              {/* Dedicated Task Details */}
              {dedicatedTask && (
                <div className="p-3 bg-white rounded-lg border border-amber-200/80 text-xs space-y-1 font-mono">
                  <div className="text-slate-500 font-sans font-semibold">Cấu trúc nhiệm vụ chuyên biệt:</div>
                  <div>task_id: {dedicatedTask.task_id}</div>
                  <div>action: {dedicatedTask.action}</div>
                  <div>target_hub: {dedicatedTask.target_hub_id || "Hub trung tâm"}</div>
                  <div>priority: {dedicatedTask.priority}</div>
                  <div>status: {dedicatedTask.status}</div>
                </div>
              )}
            </div>
          )}

          {/* Environmental Context Signals (Clearly labeled SIMULATED) */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <CloudSun className="w-4 h-4 text-sky-600" />
                <span>Tín hiệu môi trường đầu vào</span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200">
                SIMULATED
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
              <div className="p-2 rounded bg-white border border-slate-100">
                <div className="text-slate-400 text-[10px]">Thời tiết</div>
                <div className="font-semibold text-slate-800">{context.weatherCondition || "CLEAR (Quang đãng)"}</div>
              </div>
              <div className="p-2 rounded bg-white border border-slate-100">
                <div className="text-slate-400 text-[10px]">Giao thông</div>
                <div className="font-semibold text-slate-800">{context.trafficLevel || "medium (Bình thường)"}</div>
              </div>
              <div className="p-2 rounded bg-white border border-slate-100">
                <div className="text-slate-400 text-[10px]">Nguy cơ ngập</div>
                <div className="font-semibold text-slate-800">{context.floodRiskLevel || "none (An toàn)"}</div>
              </div>
              <div className="p-2 rounded bg-white border border-slate-100">
                <div className="text-slate-400 text-[10px]">Mức cảnh báo</div>
                <div className="font-semibold text-slate-800">{context.severityLevel || "low"}</div>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 italic pt-0.5">
              * Tín hiệu được giả lập cục bộ phục vụ phân tích tuyến trong giai đoạn MVP, không gọi API ngoại vi.
            </div>
          </div>

          {/* Customer & Bag Summary */}
          <div className="p-4 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-bold text-slate-900">{recovery.bag_code}</div>
              <div className="text-slate-500 mt-0.5">Khách hàng: {recovery.customer?.name || "Khách hàng"}</div>
              <div className="text-slate-500">Địa chỉ: {recovery.address}</div>
            </div>

            {onViewBagLifecycle && recovery.bag_id && (
              <button
                onClick={() => onViewBagLifecycle(recovery.bag_id)}
                className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center gap-1.5 transition shrink-0"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Xem vòng đời túi PaaS</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            Đóng bảng giải thích
          </button>
        </div>
      </div>
    </div>
  );
}
