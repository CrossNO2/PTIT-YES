"use client";
import { useEffect, useState } from "react";
import { History, Recycle, Award, Ticket, RefreshCw } from "lucide-react";

type Item = { id:string; source_id:string; kind:string; title:string; description:string; status:string; occurred_at:string; points_delta:number|null };
export default function CustomerHistoryPage() {
  const [items,setItems]=useState<Item[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const load=async()=>{setLoading(true);setError("");try{const r=await fetch('/api/customer/history');const j=await r.json();if(!r.ok||!j.success)throw new Error(j.error?.message||'Không tải được lịch sử');setItems(j.data||[])}catch(e){setError(e instanceof Error?e.message:'Không tải được lịch sử')}finally{setLoading(false)}};
  useEffect(()=>{load()},[]);
  return <div className="space-y-6">
    <div className="flex items-start justify-between gap-4 pb-6 border-b border-slate-200"><div><div className="text-xs uppercase tracking-wider font-semibold text-emerald-600">Customer Activity</div><h1 className="mt-2 text-2xl font-bold text-slate-900">Lịch sử hoạt động xanh</h1><p className="mt-1 text-sm text-slate-500">Một timeline thống nhất cho thu gom, Green Points và voucher.</p></div><button onClick={load} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"><RefreshCw className="w-4 h-4"/></button></div>
    {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {loading?<div className="p-10 text-center text-sm text-slate-500">Đang tải lịch sử...</div>:items.length===0?<div className="p-12 text-center"><History className="w-8 h-8 text-slate-300 mx-auto"/><h2 className="mt-3 font-semibold text-slate-800">Chưa có hoạt động</h2><p className="mt-1 text-sm text-slate-500">Các lần thu gom, cộng/trừ điểm và đổi voucher sẽ xuất hiện tại đây.</p></div>:items.map(item=><div key={item.id} className="px-5 py-4 border-b last:border-b-0 border-slate-100 flex items-center gap-4 hover:bg-slate-50">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.kind==='pickup'?'bg-emerald-50 text-emerald-600':item.kind==='voucher'?'bg-violet-50 text-violet-600':'bg-blue-50 text-blue-600'}`}>{item.kind==='pickup'?<Recycle className="w-5 h-5"/>:item.kind==='voucher'?<Ticket className="w-5 h-5"/>:<Award className="w-5 h-5"/>}</div>
        <div className="min-w-0 flex-1"><div className="font-semibold text-sm text-slate-900">{item.title}</div><div className="mt-0.5 text-xs text-slate-500 truncate">{item.description}</div></div>
        <div className="text-right"><div className={`text-sm font-semibold ${item.points_delta==null?'text-slate-500':item.points_delta>=0?'text-emerald-600':'text-red-600'}`}>{item.points_delta==null?item.status:`${item.points_delta>0?'+':''}${item.points_delta} pts`}</div><div className="mt-1 text-[11px] text-slate-400">{new Date(item.occurred_at).toLocaleString('vi-VN')}</div></div>
      </div>)}
    </div>
  </div>
}
