"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import type { NoticeType } from "@/lib/ui/notify";

type Notice={id:number;message:string;type:NoticeType};
export function ToastViewport(){const[items,setItems]=useState<Notice[]>([]);useEffect(()=>{const handler=(e:Event)=>{const d=(e as CustomEvent<{message:string;type:NoticeType}>).detail;const id=Date.now()+Math.random();setItems(x=>[...x,{id,...d}]);setTimeout(()=>setItems(x=>x.filter(n=>n.id!==id)),4200)};window.addEventListener('greenbridge:notice',handler);return()=>window.removeEventListener('greenbridge:notice',handler)},[]);return <div className="fixed right-5 top-20 z-[100] space-y-2 w-[360px] max-w-[calc(100vw-2rem)]">{items.map(n=>{const Icon=n.type==='success'?CheckCircle2:n.type==='error'?AlertCircle:Info;return <div key={n.id} className={`bg-white border rounded-xl shadow-lg p-4 flex gap-3 ${n.type==='error'?'border-red-200':n.type==='success'?'border-emerald-200':'border-slate-200'}`}><Icon className={`w-5 h-5 shrink-0 ${n.type==='error'?'text-red-600':n.type==='success'?'text-emerald-600':'text-blue-600'}`}/><div className="text-sm text-slate-700 flex-1">{n.message}</div><button onClick={()=>setItems(x=>x.filter(i=>i.id!==n.id))} className="text-slate-400"><X className="w-4 h-4"/></button></div>})}</div>}
