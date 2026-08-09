import Link from "next/link";
import { ArrowRight, BarChart3, Leaf, MapPinned, Recycle, ShieldCheck, Truck, CheckCircle2 } from "lucide-react";

const features = [
  { icon: Truck, title: "Tối ưu tuyến VRP", text: "Tối ưu thứ tự giao nhận theo tải trọng, time window, ca shipper và 2-opt." },
  { icon: Recycle, title: "Reverse Logistics", text: "Ghép điểm thu gom bao bì vào tuyến giao hàng để giảm quãng đường phát sinh." },
  { icon: ShieldCheck, title: "PII & QR Security", text: "Mask dữ liệu nhạy cảm, audit unmask và QR token single-use." },
  { icon: BarChart3, title: "ESG Analytics", text: "Theo dõi km tối ưu, bao bì thu gom, chi phí vận hành và chỉ số ESG." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900">
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1440px] mx-auto h-16 px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center"><Leaf className="w-5 h-5" /></div>
            <div><div className="font-bold tracking-tight">GreenBridge AI</div><div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600">Green Logistics Platform</div></div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100">Đăng nhập</Link>
            <Link href="/register" className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">Đăng ký khách hàng</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="max-w-[1440px] mx-auto px-6 lg:px-8 py-20 lg:py-28 grid grid-cols-1 xl:grid-cols-[1.05fr_.95fr] gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold"><Leaf className="w-3.5 h-3.5" /> Logistics xanh B2B / B2C</div>
            <h1 className="mt-6 text-5xl lg:text-6xl font-bold leading-[1.08] tracking-tight max-w-3xl">Tối ưu giao nhận và thu gom bao bì trong cùng một hệ thống.</h1>
            <p className="mt-6 text-lg leading-8 text-slate-600 max-w-2xl">GreenBridge kết nối điều phối tuyến, reverse logistics, Green Points, voucher và ESG analytics trên một workspace vận hành thống nhất.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">Truy cập nền tảng <ArrowRight className="w-4 h-4" /></Link>
              <Link href="/register" className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold">Bắt đầu với Customer Portal</Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
              {["OpenStreetMap + OSRM", "Supabase RLS", "QR single-use", "Desktop-first"].map(x=><span key={x} className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600" />{x}</span>)}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 bg-emerald-100/50 blur-3xl rounded-full" />
            <div className="relative bg-white border border-slate-200 rounded-3xl shadow-xl p-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100"><div><div className="text-sm font-semibold">Operations Snapshot</div><div className="text-xs text-slate-400 mt-0.5">Control center preview</div></div><span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">Live workspace</span></div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                {[['Routes','VRP'],['Pickups','Reverse'],['ESG','Analytics']].map(([a,b])=><div key={a} className="p-4 rounded-xl bg-slate-50 border border-slate-100"><div className="text-xs text-slate-400">{a}</div><div className="mt-2 font-bold text-slate-900">{b}</div></div>)}
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 h-64 relative">
                <div className="absolute inset-0 opacity-60" style={{backgroundImage:'linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg,#e2e8f0 1px, transparent 1px)',backgroundSize:'32px 32px'}} />
                <div className="absolute left-[18%] top-[65%] w-[62%] h-[3px] bg-emerald-500 rotate-[-12deg] origin-left rounded-full" />
                <div className="absolute left-[18%] top-[65%] w-4 h-4 rounded-full bg-emerald-600 border-4 border-white shadow" />
                <div className="absolute right-[20%] top-[35%] w-4 h-4 rounded-full bg-emerald-600 border-4 border-white shadow" />
                <div className="absolute left-5 bottom-5 bg-white border border-slate-200 rounded-xl shadow-sm p-3 text-xs"><MapPinned className="w-4 h-4 text-emerald-600 mb-2"/><div className="font-semibold">Optimized Route</div><div className="text-slate-400 mt-1">OSRM road matrix + 2-opt</div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-[1440px] mx-auto px-6 lg:px-8 pb-20">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">{features.map(({icon:Icon,title,text})=><div key={title} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><Icon className="w-5 h-5"/></div><h3 className="mt-4 font-semibold text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{text}</p></div>)}</div>
        </section>
      </main>
      <footer className="border-t border-slate-200 bg-white"><div className="max-w-[1440px] mx-auto px-6 lg:px-8 py-6 text-xs text-slate-400 flex items-center justify-between"><span>© 2026 GreenBridge AI</span><span>Green logistics, measurable operations.</span></div></footer>
    </div>
  );
}
