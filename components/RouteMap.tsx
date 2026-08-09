"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinned, Info } from "lucide-react";

export type RoutePoint = { id:string; label:string; lat:number; lng:number; kind:"warehouse"|"delivery"|"pickup"; status?:string };

export function RouteMap({ points, height = 520 }: { points: RoutePoint[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [error,setError]=useState("");
  const coords = useMemo(()=>points.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat!==0&&p.lng!==0),[points]);

  useEffect(()=>{
    if(typeof window==='undefined') return;
    let cancelled=false;
    const boot=()=>{
      const L=(window as any).L;
      if(!L||!ref.current||cancelled) return;
      if(mapRef.current){try{mapRef.current.remove()}catch{} mapRef.current=null}
      const center=coords[0]||{lat:21.0278,lng:105.8342};
      const map=L.map(ref.current).setView([center.lat,center.lng],12); mapRef.current=map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors',maxZoom:19}).addTo(map);
      const bounds:any[]=[];
      for(const p of coords){
        const color=p.kind==='warehouse'?'#0f172a':p.kind==='pickup'?'#f59e0b':'#16a34a';
        const icon=L.divIcon({className:'',html:`<div style="width:28px;height:28px;border-radius:999px;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(15,23,42,.18);display:flex;align-items:center;justify-content:center;color:#fff;font:700 11px Inter,system-ui">${p.kind==='warehouse'?'H':p.kind==='pickup'?'P':'D'}</div>`,iconSize:[28,28]});
        const m=L.marker([p.lat,p.lng],{icon}).addTo(map); bounds.push([p.lat,p.lng]);
        const popup=document.createElement('div'); popup.style.fontFamily='Inter,system-ui,sans-serif'; popup.style.fontSize='12px'; popup.textContent=p.label; m.bindPopup(popup);
      }
      if(bounds.length>1) map.fitBounds(bounds,{padding:[28,28]});
      if(coords.length>=2){
        fetch('/api/routing/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({coordinates:coords.map(p=>({lat:p.lat,lng:p.lng}))})})
          .then(r=>r.json()).then(j=>{if(cancelled||!j.success||!j.data?.geometry)return;const latlngs=j.data.geometry.coordinates.map((c:[number,number])=>[c[1],c[0]]);L.polyline(latlngs,{color:'#16a34a',weight:4,opacity:.9}).addTo(map);})
          .catch(()=>{});
      }
    };
    const ensure=()=>{
      if((window as any).L) return boot();
      if(!document.getElementById('leaflet-css')){const l=document.createElement('link');l.id='leaflet-css';l.rel='stylesheet';l.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(l)}
      const existing=document.getElementById('leaflet-js') as HTMLScriptElement|null;
      if(existing){existing.addEventListener('load',boot,{once:true});return}
      const s=document.createElement('script');s.id='leaflet-js';s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.onload=boot;s.onerror=()=>setError('Không tải được Leaflet. Kiểm tra kết nối mạng.');document.body.appendChild(s);
    };
    ensure(); return()=>{cancelled=true;if(mapRef.current){try{mapRef.current.remove()}catch{}mapRef.current=null}}
  },[coords]);

  return <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm"><div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between"><div className="flex items-center gap-2"><MapPinned className="w-4 h-4 text-emerald-600"/><span className="font-semibold text-slate-900">Bản đồ tuyến</span></div><div className="flex items-center gap-3 text-[11px] text-slate-500"><span>H: Kho</span><span>D: Giao</span><span>P: Thu gom</span></div></div><div className="relative bg-slate-50" style={{height}}><div ref={ref} className="absolute inset-0"/>{error&&<div className="absolute inset-0 bg-white/90 z-20 flex items-center justify-center text-center p-6"><div><Info className="w-8 h-8 text-amber-500 mx-auto"/><p className="mt-2 text-sm text-slate-600">{error}</p></div></div>}</div></div>
}
