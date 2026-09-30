"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Camera, CameraOff, CheckCircle2, ShieldCheck } from "lucide-react";
import { notify } from "@/lib/ui/notify";

type VerificationResult = {
  points: number;
  bagCode?: string;
  condition?: string;
  status?: string;
};

function ShipperScanContent() {
  const searchParams = useSearchParams();
  const queryRecoveryId = searchParams.get("recoveryId") || searchParams.get("pickupId");
  const queryBagCode = searchParams.get("bagCode");

  const [qrInput, setQrInput] = useState(queryBagCode || "");
  const [pickupId, setPickupId] = useState<string | null>(queryRecoveryId || null);
  const [token, setToken] = useState(queryBagCode || "");
  const [condition, setCondition] = useState<"good" | "needs_cleaning" | "damaged">("good");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setCameraActive(false);
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch {
      // Camera teardown should never block the verification flow.
    }
  }, []);

  const parse = useCallback(
    (raw: string) => {
      try {
        const value = raw.trim();
        let id = "";
        let qrToken = "";

        if (value.startsWith("{")) {
          const payload = JSON.parse(value) as Record<string, unknown>;
          id = String(payload.pickup_id ?? payload.pickupId ?? payload.recovery_id ?? payload.recoveryId ?? "");
          qrToken = String(payload.qr_token ?? payload.token ?? payload.bag_code ?? payload.scanned_qr ?? "");
        } else {
          const separator = value.indexOf(":");
          if (separator > 0) {
            id = value.slice(0, separator);
            qrToken = value.slice(separator + 1);
          } else {
            // Direct bag code or QR hash
            qrToken = value;
          }
        }

        if (id) {
          setPickupId(id);
        }
        setQrInput(value);
        setToken(qrToken || value);
        void stopCamera();
        return true;
      } catch {
        notify("Không thể giải mã dữ liệu QR", "error");
        return false;
      }
    },
    [stopCamera],
  );

  const startCamera = async () => {
    if (cameraBusy || cameraActive) return;
    setCameraBusy(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("greenbridge-qr-reader");
      scannerRef.current = scanner;

      const cameras = await Html5Qrcode.getCameras();
      if (!cameras.length) throw new Error("Không tìm thấy camera trên thiết bị này");
      const preferred = cameras.find((camera) => /back|rear|environment/i.test(camera.label)) ?? cameras[cameras.length - 1];

      await scanner.start(
        preferred.id,
        { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1.5 },
        (decodedText) => {
          if (parse(decodedText)) notify("Đã đọc mã QR túi PaaS", "success");
        },
        () => undefined,
      );
      setCameraActive(true);
    } catch (error) {
      await stopCamera();
      notify(error instanceof Error ? error.message : "Không thể mở camera", "error");
    } finally {
      setCameraBusy(false);
    }
  };

  useEffect(() => () => void stopCamera(), [stopCamera]);

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    const effectiveTargetId = pickupId || queryRecoveryId;
    if (!effectiveTargetId) return notify("Vui lòng nhập hoặc chọn ID lượt thu hồi (Recovery ID)", "error");
    const effectiveToken = token.trim() || qrInput.trim();
    if (!effectiveToken) return notify("Vui lòng quét hoặc nhập mã QR / mã túi PaaS", "error");

    setVerifying(true);
    try {
      // 1. First attempt modern GB-002 PaaS Recovery verification
      const res = await fetch(`/api/shipper/recoveries/${effectiveTargetId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanned_qr: effectiveToken,
          condition,
        }),
      });
      const payload = await res.json();

      if (res.ok && payload.success) {
        setResult({
          points: Number(payload.data?.points_awarded ?? 10),
          bagCode: payload.data?.bag_code || effectiveToken,
          condition,
          status: "at_hub",
        });
        notify("Túi PaaS đã được xác nhận thu hồi và chuyển trạng thái at_hub", "success");
        return;
      }

      // 2. Fallback to legacy endpoint if legacy pickup
      const fallbackRes = await fetch(`/api/pickups/${effectiveTargetId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_token: effectiveToken, actual_weight_kg: 1.0 }),
      });
      const fallbackPayload = await fallbackRes.json();
      if (!fallbackRes.ok || !fallbackPayload.success) {
        throw new Error(payload.error?.message || fallbackPayload.error?.message || "Xác thực QR thất bại");
      }

      setResult({
        points: Number(fallbackPayload.data?.points_awarded ?? 0),
        bagCode: effectiveToken,
        condition,
        status: "completed",
      });
      notify("Thu hồi đã được xác nhận và Green Points đã cộng", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Xác thực QR thất bại", "error");
    } finally {
      setVerifying(false);
    }
  };

  const reset = () => {
    void stopCamera();
    setQrInput("");
    setPickupId(queryRecoveryId || null);
    setToken("");
    setResult(null);
    setCondition("good");
  };

  return (
    <div className="space-y-6">
      <div className="pb-6 border-b border-slate-200">
        <div className="text-xs uppercase tracking-wider font-semibold text-emerald-600">PaaS Bag Verification</div>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Quét QR thu hồi túi PaaS</h1>
        <p className="mt-1 text-sm text-slate-500">
          Quét camera hoặc nhập mã túi PaaS (persistent QR) để xác nhận chuyển giao về kho (at_hub).
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          {!result ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                <div id="greenbridge-qr-reader" className="min-h-72 [&_video]:object-cover" />
                {!cameraActive && (
                  <div className="min-h-72 -mt-72 relative flex items-center justify-center text-center pointer-events-none">
                    <div>
                      <div className="w-12 h-12 rounded-2xl bg-white border border-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-sm">
                        <Camera className="w-6 h-6" />
                      </div>
                      <div className="mt-3 font-semibold text-slate-800">Sẵn sàng quét QR túi PaaS</div>
                      <div className="mt-1 text-xs text-slate-500">
                        Đưa mã QR trên túi PaaS của khách hàng vào khung hình.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {!cameraActive ? (
                  <button
                    type="button"
                    onClick={startCamera}
                    disabled={cameraBusy}
                    className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
                  >
                    <Camera className="w-4 h-4" /> {cameraBusy ? "Đang mở camera..." : "Mở camera"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void stopCamera()}
                    className="h-10 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold inline-flex items-center gap-2"
                  >
                    <CameraOff className="w-4 h-4" /> Tắt camera
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
                <span className="h-px bg-slate-200 flex-1" /> hoặc nhập thông tin xác thực <span className="h-px bg-slate-200 flex-1" />
              </div>

              <form onSubmit={verify} className="space-y-4">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Mã lượt thu hồi (Recovery Request ID)</span>
                  <input
                    type="text"
                    required
                    value={pickupId || ""}
                    onChange={(e) => setPickupId(e.target.value)}
                    placeholder="VD: rec-123 hoặc chọn từ tuyến hôm nay"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 font-mono text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Mã QR hoặc Mã túi PaaS (Bag Code)</span>
                  <input
                    type="text"
                    required
                    value={token || qrInput}
                    onChange={(e) => {
                      setToken(e.target.value);
                      setQrInput(e.target.value);
                    }}
                    placeholder="VD: BAG-001 hoặc mã QR hash"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 font-mono text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-slate-700">Tình trạng thực tế của túi</span>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as "good" | "needs_cleaning" | "damaged")}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 p-2.5 text-xs focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="good">Tốt / Nguyên vẹn</option>
                    <option value="needs_cleaning">Cần làm sạch kỹ</option>
                    <option value="damaged">Hư hỏng / Rách khóa</option>
                  </select>
                </label>

                <button
                  type="submit"
                  disabled={verifying}
                  className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {verifying ? "Đang xác thực..." : "Xác nhận thu hồi & chuyển về Hub"}
                </button>
              </form>
            </div>
          ) : (
            <div className="py-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Thu hồi túi PaaS hoàn tất</h2>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl inline-block text-left text-xs space-y-1.5 min-w-[240px]">
                <div>Mã túi: <strong className="font-mono text-slate-900">{result.bagCode}</strong></div>
                <div>Tình trạng: <span className="font-semibold text-emerald-700">{result.condition}</span></div>
                <div>Trạng thái mới: <span className="font-semibold text-blue-700">{result.status}</span></div>
                <div>Thưởng: <span className="font-semibold text-emerald-600">+{result.points} Green Points</span></div>
              </div>
              <div>
                <button
                  onClick={reset}
                  className="px-5 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700"
                >
                  Quét túi tiếp theo
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Quy trình PaaS Reverse Logistics</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li>• Túi PaaS có <b>mã QR / mã túi định danh vĩnh viễn</b>.</li>
              <li>• Quét xác thực chuyển trạng thái từ <b>recovering</b> sang <b>at_hub</b>.</li>
              <li>• Không sử dụng đơn vị cân nặng kg (theo dõi theo từng đơn vị túi).</li>
              <li>• Green Points thưởng được tự động kích hoạt qua hệ thống PaaS.</li>
            </ul>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-sm text-emerald-900">
            Tất cả thao tác cập nhật vòng đời túi đều thông qua các RPC an toàn và được ghi nhận đầy đủ trong nhật ký sự kiện vòng đời.
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function ShipperScanPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Đang tải máy quét...</div>}>
      <ShipperScanContent />
    </Suspense>
  );
}
