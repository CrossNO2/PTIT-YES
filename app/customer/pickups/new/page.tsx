"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Recycle, ArrowRight, CheckCircle2, MapPin, CalendarDays, Clock3, PackageOpen } from "lucide-react";

export default function NewPackagingPickupPage() {
  const router = useRouter();
  const [packagingType, setPackagingType] = useState("Carton / Hộp Giấy");
  const [estimatedQuantityKg, setEstimatedQuantityKg] = useState("3.0");
  const [address, setAddress] = useState("");
  const [pickupDate, setPickupDate] = useState(new Date().toISOString().split("T")[0]);
  const [availableFrom, setAvailableFrom] = useState("08:00");
  const [availableUntil, setAvailableUntil] = useState("17:00");
  const [submitting, setSubmitting] = useState(false);
  const [createdPickupId, setCreatedPickupId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/pickups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packaging_type: packagingType, estimated_quantity_kg: Number(estimatedQuantityKg), address, pickup_date: pickupDate, available_from: availableFrom, available_until: availableUntil }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Không thể tạo yêu cầu thu gom");
      setCreatedPickupId(json.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi kết nối khi tạo yêu cầu thu gom");
    } finally {
      setSubmitting(false);
    }
  };

  if (createdPickupId) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center"><CheckCircle2 className="w-7 h-7" /></div>
          <h1 className="mt-5 text-2xl font-bold text-slate-900">Yêu cầu thu gom đã được tạo</h1>
          <p className="mt-2 text-sm text-slate-500">GreenBridge đã lưu yêu cầu vào hệ thống. Khi được ghép tuyến, trạng thái và QR xác nhận sẽ hiển thị trong chi tiết yêu cầu.</p>
          <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl text-left">
            <div className="text-xs text-slate-500">Mã yêu cầu</div>
            <div className="mt-1 font-mono text-sm font-semibold text-slate-800 break-all">{createdPickupId}</div>
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => router.push(`/customer/pickups/${createdPickupId}`)} className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">Xem chi tiết</button>
            <button onClick={() => router.push("/customer/home")} className="px-5 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold">Về tổng quan</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6 pb-6 border-b border-slate-200">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Reverse Logistics</div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Đăng ký trả bao bì tái chế</h1>
          <p className="mt-1 text-sm text-slate-500">Nhập địa chỉ và khung giờ có thể nhận. Hệ thống sẽ geocode bằng OpenStreetMap và chờ ghép vào tuyến phù hợp.</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Recycle className="w-5 h-5" /></div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Loại bao bì" icon={<PackageOpen className="w-4 h-4" />}>
              <select value={packagingType} onChange={(e) => setPackagingType(e.target.value)} className="field-control">
                <option>Carton / Hộp Giấy</option><option>Túi Nilon Tái Chế</option><option>Chai / Lọ Nhựa PET</option><option>Xốp Bọc Hàng Bubble Wrap</option>
              </select>
            </Field>
            <Field label="Khối lượng ước tính (kg)" icon={<Recycle className="w-4 h-4" />}>
              <input type="number" min="0.1" step="0.1" required value={estimatedQuantityKg} onChange={(e) => setEstimatedQuantityKg(e.target.value)} className="field-control" />
            </Field>
          </div>

          <Field label="Địa chỉ nhận thu gom" icon={<MapPin className="w-4 h-4" />}>
            <input required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ví dụ: 100 Nguyễn Trãi, Thanh Xuân, Hà Nội" className="field-control" />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Field label="Ngày có thể nhận" icon={<CalendarDays className="w-4 h-4" />}>
              <input type="date" required value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="field-control" />
            </Field>
            <Field label="Có mặt từ" icon={<Clock3 className="w-4 h-4" />}>
              <input type="time" required value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} className="field-control" />
            </Field>
            <Field label="Đến khi" icon={<Clock3 className="w-4 h-4" />}>
              <input type="time" required value={availableUntil} onChange={(e) => setAvailableUntil(e.target.value)} className="field-control" />
            </Field>
          </div>

          <div className="pt-2 flex justify-end">
            <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50">
              {submitting ? "Đang tạo yêu cầu..." : "Tạo yêu cầu thu gom"}<ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Quy trình xử lý</h2>
            <ol className="mt-4 space-y-4 text-sm text-slate-600">
              {["Gửi yêu cầu & định vị địa chỉ", "Dispatcher ghép vào tuyến tối ưu", "Shipper nhận bao bì và xác nhận QR", "Green Points được cộng vào ledger"].map((x, i) => <li key={x} className="flex gap-3"><span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">{i+1}</span><span>{x}</span></li>)}
            </ol>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900"><strong>Không dùng tọa độ giả.</strong><p className="mt-1 text-emerald-800">Nếu địa chỉ không tìm thấy trên OpenStreetMap, hệ thống sẽ yêu cầu bạn sửa địa chỉ thay vì tự gán điểm mặc định.</p></div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700">{icon}{label}</span>{children}</label>;
}
