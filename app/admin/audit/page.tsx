"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, Search } from "lucide-react";
import { useShop } from "@/lib/hooks/use-shop-context";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";

interface AuditLogItem {
  id: string; action: string; accessed_by: string; order_id: string; reason: string; ip_address: string | null; created_at: string;
  profiles?: { name?: string; email?: string } | null;
  orders?: { order_code?: string; shop_id?: string } | null;
}

export default function AdminAuditPage() {
  const { shopId } = useShop();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const fetchLogs = useCallback(async () => {
    if (!shopId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/audit?shop_id=${encodeURIComponent(shopId)}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || "Không tải được audit log");
      setLogs(json.data ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Không tải được audit log"); }
    finally { setLoading(false); }
  }, [shopId]);

  useEffect(() => { void fetchLogs(); }, [fetchLogs]);
  const filtered = logs.filter((l) => `${l.action} ${l.reason} ${l.profiles?.name ?? ""} ${l.orders?.order_code ?? l.order_id}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="space-y-6">
    <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pb-6 border-b border-slate-200">
      <div><div className="text-xs uppercase tracking-[0.18em] font-semibold text-emerald-600">Security & Compliance</div><h1 className="mt-2 text-2xl font-bold text-slate-950">Nhật ký truy cập dữ liệu nhạy cảm</h1><p className="mt-1 text-sm text-slate-500">Theo dõi các lần mở PII của khách hàng và lý do truy cập.</p></div>
      <button onClick={() => void fetchLogs()} className="h-10 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 inline-flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}/> Làm mới</button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card><div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sự kiện gần nhất</div><div className="mt-3 text-2xl font-bold text-slate-950">{logs.length}</div><div className="mt-1 text-xs text-slate-500">tối đa 100 bản ghi mới nhất</div></Card>
      <Card><div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Loại kiểm toán</div><div className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><ShieldCheck className="w-5 h-5 text-emerald-600"/> PII access audit</div><div className="mt-1 text-xs text-slate-500">Không hiển thị dữ liệu nhạy cảm trong bảng.</div></Card>
      <Card><label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tìm kiếm</label><div className="mt-3 relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} className="field-control pl-9" placeholder="Tên, action, mã đơn..."/></div></Card>
    </div>

    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {loading ? <div className="p-14 text-center text-sm text-slate-500"><RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600"/>Đang tải audit log...</div>
      : error ? <div className="p-10 text-center"><div className="font-semibold text-red-700">Không thể tải dữ liệu</div><div className="mt-1 text-sm text-slate-500">{error}</div></div>
      : filtered.length === 0 ? <div className="p-14 text-center text-sm text-slate-500">Chưa có bản ghi phù hợp.</div>
      : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3 text-left">Thời gian</th><th className="px-5 py-3 text-left">Action</th><th className="px-5 py-3 text-left">Người truy cập</th><th className="px-5 py-3 text-left">Đơn hàng</th><th className="px-5 py-3 text-left">Lý do / IP</th></tr></thead><tbody className="divide-y divide-slate-100">{filtered.map(log=><tr key={log.id} className="hover:bg-slate-50"><td className="px-5 py-4 text-slate-500 whitespace-nowrap">{new Date(log.created_at).toLocaleString("vi-VN")}</td><td className="px-5 py-4"><StatusPill status={log.action} variant="warning"/></td><td className="px-5 py-4"><div className="font-medium text-slate-900">{log.profiles?.name || "Thành viên"}</div><div className="text-xs text-slate-400">{log.profiles?.email || log.accessed_by.slice(0,8)}</div></td><td className="px-5 py-4 font-mono text-xs font-semibold text-emerald-700">{log.orders?.order_code || log.order_id.slice(0,8)}</td><td className="px-5 py-4 max-w-lg"><div className="text-slate-700">{log.reason}</div><div className="mt-1 font-mono text-xs text-slate-400">{log.ip_address || "IP unavailable"}</div></td></tr>)}</tbody></table></div>}
    </div>
  </div>;
}
