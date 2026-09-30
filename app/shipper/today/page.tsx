"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Eye,
  Lock,
  MapPin,
  Navigation,
  Phone,
  Play,
  RefreshCw,
  XCircle,
  Camera,
  Route as RouteIcon,
  PackageOpen,
  QrCode,
  ShieldCheck,
  Check,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { notify } from "@/lib/ui/notify";
import { RouteMap, RoutePoint } from "@/components/RouteMap";
import type { Route, RouteStop } from "@/types/database";

interface ShipperOrderMasked {
  id: string;
  order_code: string;
  customer_name_masked: string;
  customer_phone_masked: string;
  address: string;
  lat: number;
  lng: number;
  delivery_date: string;
  time_slot_start: string;
  time_slot_end: string;
  weight_kg: number;
  priority: number;
  status: string;
  assigned_route_id: string;
}

interface RecoveryPickupPoint {
  id: string;
  recovery_request_id?: string;
  bag_id?: string;
  bag_code?: string;
  qr_code_hash?: string;
  address: string;
  lat: number;
  lng: number;
  packaging_type?: string;
  pickup_date?: string;
  time_slot?: string;
  status: string;
  recovery_strategy?: string;
  customer_name?: string;
  customer_phone_masked?: string;
  assigned_route_id?: string;
}

type RouteWithWarehouse = Route & {
  warehouses?: { name: string; address: string; lat: number; lng: number } | null;
};

export default function ShipperTodayPage() {
  const [route, setRoute] = useState<RouteWithWarehouse | null>(null);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [orders, setOrders] = useState<ShipperOrderMasked[]>([]);
  const [pickups, setPickups] = useState<RecoveryPickupPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [unmaskedPhones, setUnmaskedPhones] = useState<Record<string, string>>({});
  const [unmaskedNames, setUnmaskedNames] = useState<Record<string, string>>({});
  const [unmaskOrder, setUnmaskOrder] = useState<ShipperOrderMasked | null>(null);
  const [proofOrder, setProofOrder] = useState<ShipperOrderMasked | null>(null);
  const [failOrder, setFailOrder] = useState<ShipperOrderMasked | null>(null);
  const [failReason, setFailReason] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);

  // Recovery Verification Modal State
  const [verifyModal, setVerifyModal] = useState<RecoveryPickupPoint | null>(null);
  const [verifyQrInput, setVerifyQrInput] = useState("");
  const [verifyCondition, setVerifyCondition] = useState<"good" | "needs_cleaning" | "damaged">("good");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/shipper/today");
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error?.message || "Không tải được tuyến hôm nay");
      setRoute(j.data.route || null);
      setStops(j.data.stops || []);
      setOrders(j.data.orders || []);
      setPickups(j.data.pickups || j.data.recoveries || []);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không tải được tuyến hôm nay", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const start = async () => {
    if (!route) return;
    setActionLoading(true);
    try {
      const r = await fetch(`/api/routes/${route.id}/start`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error?.message || "Không thể bắt đầu tuyến");
      notify("Tuyến đã chuyển sang trạng thái đang thực hiện", "success");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không thể bắt đầu tuyến", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const updateOrder = async (orderId: string, status: string, failureReason?: string, proofPath?: string) => {
    setActionLoading(true);
    try {
      const r = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, failure_reason: failureReason, proof_image_url: proofPath }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error?.message || "Không thể cập nhật đơn hàng");
      setProofOrder(null);
      setFailOrder(null);
      setProofFile(null);
      setFailReason("");
      notify(
        status === "delivered"
          ? "Đã xác nhận giao hàng thành công"
          : status === "failed"
          ? "Đã ghi nhận giao hàng thất bại"
          : "Đã cập nhật trạng thái",
        "success"
      );
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không thể cập nhật đơn hàng", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const uploadProofAndComplete = async () => {
    if (!route || !proofOrder) return;
    if (!proofFile) return notify("Vui lòng chọn ảnh bằng chứng giao hàng", "error");
    setActionLoading(true);
    try {
      const supabase = createClient();
      const ext = (proofFile.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${route.shop_id}/${proofOrder.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("delivery-proofs")
        .upload(path, proofFile, { contentType: proofFile.type, upsert: false });
      if (error) throw error;
      await updateOrder(proofOrder.id, "delivered", undefined, path);
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không upload được bằng chứng giao hàng", "error");
      setActionLoading(false);
    }
  };

  const unmask = async (order: ShipperOrderMasked) => {
    try {
      const r = await fetch(`/api/orders/${order.id}/unmask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Shipper contacting customer during active delivery" }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error?.message || "Không thể mở thông tin liên hệ");
      setUnmaskedPhones((x) => ({ ...x, [order.id]: j.data.customer_phone }));
      setUnmaskedNames((x) => ({ ...x, [order.id]: j.data.customer_name }));
      setUnmaskOrder(null);
      notify("Thông tin liên hệ đã được mở và ghi audit log", "success");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không thể mở thông tin liên hệ", "error");
    }
  };

  const complete = async () => {
    if (!route) return;
    setActionLoading(true);
    try {
      const r = await fetch(`/api/routes/${route.id}/complete`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error?.message || "Không thể hoàn tất tuyến");
      notify("Tuyến đã hoàn tất và báo cáo ESG đã được tạo", "success");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không thể hoàn tất tuyến", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Shipper GB-002 Recovery Actions
  const handleStartRecovery = async (recoveryId: string) => {
    setActionLoading(true);
    try {
      const r = await fetch(`/api/shipper/recoveries/${recoveryId}/start`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error?.message || "Không thể bắt đầu thu hồi túi");
      notify("Đã chuyển trạng thái sang Đang Thu Hồi (recovering)", "success");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không thể bắt đầu thu hồi túi", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyRecovery = async () => {
    if (!verifyModal) return;
    if (!verifyQrInput.trim()) {
      notify("Vui lòng nhập hoặc quét mã QR/mã túi PaaS", "error");
      return;
    }
    setActionLoading(true);
    try {
      const r = await fetch(`/api/shipper/recoveries/${verifyModal.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanned_qr: verifyQrInput.trim(),
          condition: verifyCondition,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error?.message || "Xác thực thu hồi túi thất bại");
      notify("Đã xác nhận thu hồi túi PaaS! Túi chuyển về trạng thái at_hub", "success");
      setVerifyModal(null);
      setVerifyQrInput("");
      setVerifyCondition("good");
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Xác thực thu hồi túi thất bại", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const mapPoints = useMemo<RoutePoint[]>(() => {
    if (!route) return [];
    const list: RoutePoint[] = [];
    if (route.warehouses) {
      list.push({
        id: "warehouse",
        label: route.warehouses.name,
        lat: Number(route.warehouses.lat),
        lng: Number(route.warehouses.lng),
        kind: "warehouse",
      });
    }
    for (const stop of [...stops].sort((a, b) => a.sequence_index - b.sequence_index)) {
      if (stop.stop_type === "delivery" && stop.order_id) {
        const o = orders.find((x) => x.id === stop.order_id);
        if (o) {
          list.push({
            id: o.id,
            label: `${o.order_code} · ${o.address}`,
            lat: Number(o.lat),
            lng: Number(o.lng),
            kind: "delivery",
            status: o.status,
          });
        }
      }
      if (
        ((stop.stop_type as string) === "pickup" || stop.stop_type === "recovery") &&
        (stop.recovery_request_id || stop.pickup_id)
      ) {
        const targetId = stop.recovery_request_id || stop.pickup_id;
        const p = pickups.find((x) => x.id === targetId);
        if (p) {
          list.push({
            id: p.id,
            label: `${p.packaging_type || p.bag_code || "PaaS Bag"} · ${p.address}`,
            lat: Number(p.lat),
            lng: Number(p.lng),
            kind: "pickup",
            status: p.status,
          });
        }
      }
    }
    return list;
  }, [route, stops, orders, pickups]);

  const canComplete =
    route?.status === "in_progress" &&
    stops.length > 0 &&
    stops.every((s) => ["completed", "failed", "skipped"].includes(s.status));

  if (loading) {
    return (
      <div className="py-20 text-center text-sm text-slate-500">
        <RefreshCw className="w-5 h-5 animate-spin text-emerald-600 mx-auto mb-3" />
        Đang tải tuyến hôm nay...
      </div>
    );
  }

  if (!route) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
        <MapPin className="w-9 h-9 text-slate-300 mx-auto" />
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Chưa có tuyến được giao</h1>
        <p className="mt-2 text-sm text-slate-500">Dispatcher chưa gán tuyến đang hoạt động cho bạn.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="text-xs uppercase tracking-wider font-semibold text-emerald-600">Today Route</div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">RT-{route.id.slice(0, 8).toUpperCase()}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {route.route_date} · {stops.length} điểm dừng · {Number(route.optimized_distance_km || 0).toFixed(1)} km
          </p>
        </div>
        <div className="flex gap-2">
          {route.status === "assigned" && (
            <button
              onClick={start}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
            >
              <Play className="w-4 h-4" /> Bắt đầu tuyến
            </button>
          )}
          {canComplete && (
            <button
              onClick={complete}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-semibold"
            >
              <CheckCircle2 className="w-4 h-4" /> Hoàn tất tuyến
            </button>
          )}
          <span className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-semibold">
            {route.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.1fr)_minmax(460px,.9fr)] gap-6">
        <RouteMap points={mapPoints} height={620} />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Đơn giao trong tuyến</h2>
            <span className="text-xs text-slate-400">PII masked mặc định</span>
          </div>
          {orders.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-sm text-slate-500">
              Tuyến chưa có đơn giao.
            </div>
          ) : (
            orders.map((o, i) => {
              const delivering = o.status === "delivering";
              return (
                <div
                  key={o.id}
                  className={`bg-white border rounded-2xl p-4 shadow-sm ${
                    delivering ? "border-emerald-300" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-semibold">
                        {i + 1}
                      </span>
                      <div>
                        <div className="font-mono font-semibold text-sm text-slate-900">{o.order_code}</div>
                        <div className="mt-1 text-xs text-slate-500">{o.address}</div>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        o.status === "delivered"
                          ? "bg-emerald-50 text-emerald-700"
                          : o.status === "failed"
                          ? "bg-red-50 text-red-700"
                          : delivering
                          ? "bg-blue-50 text-blue-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {o.status}
                    </span>
                  </div>
                  <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-slate-800">
                        {unmaskedNames[o.id] || o.customer_name_masked}
                      </div>
                      <div className="mt-1 text-slate-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {unmaskedPhones[o.id] || o.customer_phone_masked}
                      </div>
                    </div>
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${o.lat}&mlon=${o.lng}#map=16/${o.lat}/${o.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-700 font-semibold"
                    >
                      <Navigation className="w-3.5 h-3.5" /> Mở bản đồ
                    </a>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {o.status === "assigned" && (
                      <button
                        onClick={() => updateOrder(o.id, "delivering")}
                        className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold"
                      >
                        Bắt đầu giao
                      </button>
                    )}
                    {delivering && !unmaskedPhones[o.id] && (
                      <button
                        onClick={() => setUnmaskOrder(o)}
                        className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" /> Xem liên hệ
                      </button>
                    )}
                    {delivering && (
                      <>
                        <button
                          onClick={() => setProofOrder(o)}
                          className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold ml-auto inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Thành công
                        </button>
                        <button
                          onClick={() => setFailOrder(o)}
                          className="px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs font-semibold"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Thất bại
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* REVERSE LOGISTICS / PAAS BAG RECOVERIES SECTION */}
      {pickups.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RouteIcon className="w-4 h-4 text-emerald-600" />
              <h2 className="font-semibold text-slate-900">Điểm thu hồi túi PaaS trên tuyến (Reverse Logistics)</h2>
            </div>
            <Link
              href="/shipper/scan"
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1.5"
            >
              <QrCode className="w-3.5 h-3.5" /> Mở máy quét QR
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {pickups.map((p) => {
              const isPending = ["requested", "assigned", "pending"].includes(p.status);
              const isRecovering = ["recovering", "collecting", "in_transit"].includes(p.status);
              const isAtHub = ["at_hub", "completed"].includes(p.status);

              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-4 transition space-y-3 ${
                    isRecovering
                      ? "bg-amber-50/60 border-amber-300"
                      : isAtHub
                      ? "bg-emerald-50/50 border-emerald-200"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <PackageOpen className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900 font-mono">
                          {p.bag_code || "Túi PaaS"}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {p.recovery_strategy === "strategy_a_merge"
                            ? "Ghép tuyến (Strategy A)"
                            : "Chuyến riêng (Strategy C)"}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        isAtHub
                          ? "bg-emerald-100 text-emerald-800"
                          : isRecovering
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1">
                    <div>
                      Khách hàng: <strong className="text-slate-800">{p.customer_name || "Khách hàng"}</strong>
                    </div>
                    <div>
                      SĐT: <span className="font-mono text-slate-500">{p.customer_phone_masked || "090****000"}</span>
                    </div>
                    <div className="line-clamp-2 text-slate-500">{p.address}</div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-2">
                    {isPending && (
                      <button
                        onClick={() => handleStartRecovery(p.id)}
                        disabled={actionLoading}
                        className="w-full py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition"
                      >
                        Bắt đầu thu hồi
                      </button>
                    )}

                    {isRecovering && (
                      <div className="w-full flex gap-2">
                        <button
                          onClick={() => {
                            setVerifyModal(p);
                            setVerifyQrInput(p.bag_code || p.qr_code_hash || "");
                          }}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition flex items-center justify-center gap-1"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" /> Xác nhận thu túi
                        </button>
                        <Link
                          href={`/shipper/scan?recoveryId=${p.id}&bagCode=${encodeURIComponent(p.bag_code || "")}`}
                          className="py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
                          title="Quét bằng camera"
                        >
                          <Camera className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    )}

                    {isAtHub && (
                      <div className="w-full text-center text-xs font-semibold text-emerald-700 flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đã thu về Hub (at_hub)
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL: VERIFY PAAS BAG RECOVERY */}
      {verifyModal && (
        <Modal>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Xác nhận thu hồi túi PaaS</h3>
                <p className="text-xs text-slate-500">
                  Quét mã QR hoặc đối chiếu mã túi in trên nhãn PaaS
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs text-slate-600">
              <div>
                Túi PaaS: <strong className="text-slate-900 font-mono">{verifyModal.bag_code || "Chưa xác định"}</strong>
              </div>
              <div>Khách hàng: {verifyModal.customer_name}</div>
              <div>Địa chỉ: {verifyModal.address}</div>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Mã QR hoặc Mã túi PaaS quét được</span>
                <input
                  type="text"
                  value={verifyQrInput}
                  onChange={(e) => setVerifyQrInput(e.target.value)}
                  placeholder="VD: BAG-001 hoặc mã QR hash"
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Tình trạng thực tế của túi</span>
                <select
                  value={verifyCondition}
                  onChange={(e) => setVerifyCondition(e.target.value as "good" | "needs_cleaning" | "damaged")}
                  className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="good">Tốt / Nguyên vẹn (Sẵn sàng tái sử dụng sau vệ sinh)</option>
                  <option value="needs_cleaning">Cần làm sạch kỹ (Bụi bẩn thông thường)</option>
                  <option value="damaged">Hư hỏng / Rách khóa (Chuyển sang sửa chữa)</option>
                </select>
              </label>
            </div>

            <div className="text-[11px] text-slate-500 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
              * Khi xác nhận, túi PaaS sẽ chuyển sang trạng thái <strong>at_hub</strong> để sẵn sàng quy trình kiểm tra vệ sinh tại kho.
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVerifyModal(null)}
                className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleVerifyRecovery}
                disabled={actionLoading}
                className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Xác nhận về kho
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: UNMASK CONTACT INFO */}
      {unmaskOrder && (
        <Modal>
          <div className="text-center">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="mt-3 font-semibold text-slate-900">Mở thông tin liên hệ</h3>
            <p className="mt-2 text-sm text-slate-500">Hành động này được ghi vào order_access_logs.</p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setUnmaskOrder(null)}
                className="flex-1 py-2 rounded-lg border border-slate-200 text-sm"
              >
                Hủy
              </button>
              <button
                onClick={() => unmask(unmaskOrder)}
                className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: PROOF OF DELIVERY */}
      {proofOrder && (
        <Modal>
          <div>
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-emerald-600" />
              <h3 className="font-semibold text-slate-900">Proof of Delivery</h3>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Ảnh được upload vào bucket private theo đường dẫn shop/order.
            </p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setProofFile(e.target.files?.[0] || null)}
              className="mt-4 block w-full text-sm text-slate-600 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 file:font-semibold"
            />
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  setProofOrder(null);
                  setProofFile(null);
                }}
                className="flex-1 py-2 rounded-lg border border-slate-200 text-sm"
              >
                Hủy
              </button>
              <button
                onClick={uploadProofAndComplete}
                disabled={actionLoading}
                className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                Upload & hoàn tất
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: FAIL ORDER */}
      {failOrder && (
        <Modal>
          <div>
            <h3 className="font-semibold text-slate-900">Lý do giao thất bại</h3>
            <textarea
              rows={4}
              value={failReason}
              onChange={(e) => setFailReason(e.target.value)}
              className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm"
              placeholder="Khách không nghe máy, sai địa chỉ..."
            />
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setFailOrder(null)}
                className="flex-1 py-2 rounded-lg border border-slate-200 text-sm"
              >
                Hủy
              </button>
              <button
                onClick={() => updateOrder(failOrder.id, "failed", failReason)}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold"
              >
                Xác nhận
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6">
        {children}
      </div>
    </div>
  );
}
