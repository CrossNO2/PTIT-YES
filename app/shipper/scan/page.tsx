"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, QrCode, Scale, ShieldCheck } from "lucide-react";
import { notify } from "@/lib/ui/notify";

type VerificationResult = { points: number; weight: number };

export default function ShipperScanPage() {
  const [qrInput, setQrInput] = useState("");
  const [pickupId, setPickupId] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [weight, setWeight] = useState("3.0");
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
          id = String(payload.pickup_id ?? payload.pickupId ?? "");
          qrToken = String(payload.qr_token ?? payload.token ?? "");
        } else {
          const separator = value.indexOf(":");
          if (separator > 0) {
            id = value.slice(0, separator);
            qrToken = value.slice(separator + 1);
          }
        }

        if (!id || !qrToken) {
          notify("Định dạng QR không hợp lệ", "error");
          return false;
        }

        setQrInput(value);
        setPickupId(id);
        setToken(qrToken);
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
          if (parse(decodedText)) notify("Đã đọc mã QR", "success");
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
    if (!pickupId || !token) return notify("Thiếu Pickup ID hoặc token xác thực", "error");
    setVerifying(true);
    try {
      const response = await fetch(`/api/pickups/${pickupId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qr_token: token, actual_weight_kg: Number(weight) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error?.message || "Xác thực QR thất bại");
      setResult({
        points: Number(payload.data.points_awarded ?? 0),
        weight: Number(payload.data.actual_weight_kg ?? weight),
      });
      notify("Thu gom đã được xác nhận và Green Points đã cộng", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Xác thực QR thất bại", "error");
    } finally {
      setVerifying(false);
    }
  };

  const reset = () => {
    void stopCamera();
    setQrInput("");
    setPickupId(null);
    setToken("");
    setResult(null);
    setWeight("3.0");
  };

  return (
    <div className="space-y-6">
      <div className="pb-6 border-b border-slate-200">
        <div className="text-xs uppercase tracking-wider font-semibold text-emerald-600">Pickup Verification</div>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Quét QR thu gom bao bì</h1>
        <p className="mt-1 text-sm text-slate-500">Quét bằng camera hoặc nhập payload để xác thực token single-use và ghi nhận khối lượng thực tế.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          {!pickupId && !result ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
                <div id="greenbridge-qr-reader" className="min-h-72 [&_video]:object-cover" />
                {!cameraActive && (
                  <div className="min-h-72 -mt-72 relative flex items-center justify-center text-center pointer-events-none">
                    <div>
                      <div className="w-12 h-12 rounded-2xl bg-white border border-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-sm"><Camera className="w-6 h-6" /></div>
                      <div className="mt-3 font-semibold text-slate-800">Sẵn sàng quét QR</div>
                      <div className="mt-1 text-xs text-slate-500">Cho phép quyền camera, sau đó đưa QR của customer vào khung hình.</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {!cameraActive ? (
                  <button type="button" onClick={startCamera} disabled={cameraBusy} className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                    <Camera className="w-4 h-4" /> {cameraBusy ? "Đang mở camera..." : "Mở camera"}
                  </button>
                ) : (
                  <button type="button" onClick={() => void stopCamera()} className="h-10 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold inline-flex items-center gap-2">
                    <CameraOff className="w-4 h-4" /> Tắt camera
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400"><span className="h-px bg-slate-200 flex-1" /> hoặc nhập thủ công <span className="h-px bg-slate-200 flex-1" /></div>
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">QR payload</span>
                <textarea value={qrInput} onChange={(event) => setQrInput(event.target.value)} rows={4} placeholder='{"pickup_id":"...","qr_token":"..."}' className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-500" />
              </label>
              <button type="button" onClick={() => parse(qrInput)} className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2"><QrCode className="w-4 h-4" /> Xử lý mã QR</button>
            </div>
          ) : pickupId && !result ? (
            <form onSubmit={verify} className="space-y-5">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm"><ShieldCheck className="w-4 h-4" /> QR payload hợp lệ về định dạng</div>
                <div className="mt-2 text-xs text-emerald-700 font-mono break-all">Pickup: {pickupId}</div>
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-2"><Scale className="w-4 h-4" /> Khối lượng thực tế (kg)</span>
                <input type="number" min="0.1" max="10000" step="0.1" required value={weight} onChange={(event) => setWeight(event.target.value)} className="field-control mt-2" />
              </label>
              <button disabled={verifying} className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">{verifying ? "Đang xác thực..." : "Xác nhận thu gom & cộng điểm"}</button>
              <button type="button" onClick={reset} className="w-full h-11 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700">Quét lại</button>
            </form>
          ) : (
            <div className="py-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center"><CheckCircle2 className="w-7 h-7" /></div>
              <h2 className="mt-4 text-xl font-bold text-slate-900">Thu gom đã hoàn tất</h2>
              <p className="mt-2 text-sm text-slate-500">Khối lượng {result?.weight.toFixed(1)} kg · +{result?.points} Green Points</p>
              <button onClick={reset} className="mt-6 px-5 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700">Quét mã tiếp theo</button>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Điều kiện xác thực</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
              <li>• Pickup phải được gán vào tuyến của shipper.</li>
              <li>• Tuyến phải đang ở trạng thái <b>in_progress</b>.</li>
              <li>• Token còn hạn và chưa được sử dụng.</li>
              <li>• Green Points chỉ ghi một lần bằng idempotency key.</li>
            </ul>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-sm text-emerald-900">
            Camera chỉ đọc payload QR ở trình duyệt. Việc xác thực quyền shipper, route, token và cộng điểm vẫn diễn ra server-side trong Supabase RPC.
          </div>
        </aside>
      </div>
    </div>
  );
}
