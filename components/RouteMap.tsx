"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinned, Info } from "lucide-react";
import { useTheme } from "@/components/theme/theme-provider";

export type RoutePoint = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: "warehouse" | "delivery" | "pickup" | "recovery";
  status?: string;
  sequence?: number;
  bag_code?: string;
  address?: string;
};

export function RouteMap({
  points,
  height = 520,
}: {
  points: RoutePoint[];
  height?: number;
}) {
  const { theme } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [error, setError] = useState("");

  const coords = useMemo(
    () =>
      points.filter(
        (p) =>
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng) &&
          p.lat !== 0 &&
          p.lng !== 0
      ),
    [points]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;

    const boot = () => {
      const L = (window as any).L;
      if (!L || !ref.current || cancelled) return;
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {}
        mapRef.current = null;
      }

      const center = coords[0] || { lat: 21.0285, lng: 105.8542 };
      const map = L.map(ref.current).setView([center.lat, center.lng], 12);
      mapRef.current = map;

      const dark = theme === "dark";
      const tileUrl = dark
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
      const attribution = dark
        ? "&copy; OpenStreetMap contributors &copy; CARTO"
        : "&copy; OpenStreetMap contributors";

      L.tileLayer(tileUrl, { attribution, maxZoom: 19, subdomains: dark ? "abcd" : "abc" }).addTo(map);

      const bounds: any[] = [];

      for (const p of coords) {
        const isRec = p.kind === "pickup" || p.kind === "recovery";
        const isWh = p.kind === "warehouse";
        const color = isWh
          ? dark ? "#94a3b8" : "#0f172a"
          : isRec
          ? "#f59e0b"
          : dark ? "#34D399" : "#16a34a";
        const iconChar = isWh ? "H" : isRec ? "R" : "D";

        const icon = L.divIcon({
          className: "",
          html: `<div style="width:30px;height:30px;border-radius:999px;background:${color};border:3px solid white;box-shadow:0 3px 10px rgba(15,23,42,.22);display:flex;align-items:center;justify-content:center;color:#fff;font:700 12px Inter,system-ui;letter-spacing:-0.5px">${iconChar}</div>`,
          iconSize: [30, 30],
        });

        const m = L.marker([p.lat, p.lng], { icon }).addTo(map);
        bounds.push([p.lat, p.lng]);

        const popupDiv = document.createElement("div");
        popupDiv.style.fontFamily = "Inter, system-ui, sans-serif";
        popupDiv.style.fontSize = "12px";
        popupDiv.style.lineHeight = "1.4";
        popupDiv.innerHTML = `
          <div style="font-weight: 700; color: ${color}; margin-bottom: 2px;">
            ${isWh ? "KHO / HUB TRUNG TÂM" : isRec ? "ĐIỂM THU HỒI TÚI PAAS" : "ĐIỂM GIAO HÀNG"}
            ${p.sequence ? ` · Điểm #${p.sequence}` : ""}
          </div>
          <div style="font-weight: 600; color: #0f172a; margin-bottom: 4px;">${p.label}</div>
          ${p.bag_code ? `<div style="color: #64748b; font-size: 11px;">Mã túi: <b>${p.bag_code}</b></div>` : ""}
          ${p.address ? `<div style="color: #64748b; font-size: 11px; margin-top: 2px;">${p.address}</div>` : ""}
          ${p.status ? `<div style="margin-top: 4px; display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #f1f5f9; color: #334155;">Trạng thái: ${p.status}</div>` : ""}
        `;
        m.bindPopup(popupDiv);
      }

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [32, 32] });
      }

      if (coords.length >= 2) {
        fetch("/api/routing/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ coordinates: coords.map((p) => ({ lat: p.lat, lng: p.lng })) }),
        })
          .then((r) => r.json())
          .then((j) => {
            if (cancelled || !j.success || !j.data?.geometry) return;
            const latlngs = j.data.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
            L.polyline(latlngs, {
              color: theme === "dark" ? "#34D399" : "#16a34a",
              weight: 4,
              opacity: 0.9,
            }).addTo(map);
          })
          .catch(() => {});
      }
    };

    const ensure = () => {
      if ((window as any).L) return boot();
      if (!document.getElementById("leaflet-css")) {
        const l = document.createElement("link");
        l.id = "leaflet-css";
        l.rel = "stylesheet";
        l.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(l);
      }
      const existing = document.getElementById("leaflet-js") as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", boot, { once: true });
        return;
      }
      const s = document.createElement("script");
      s.id = "leaflet-js";
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = boot;
      s.onerror = () => setError("Không tải được bản đồ tương tác. Kiểm tra kết nối mạng.");
      document.body.appendChild(s);
    };

    ensure();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {}
        mapRef.current = null;
      }
    };
  }, [coords, theme]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPinned className="w-4 h-4 text-emerald-600" />
          <span className="font-semibold text-xs text-slate-900 uppercase tracking-wider">
            GALM Operational Route Map
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-slate-900 inline-flex items-center justify-center text-[8px] font-bold text-white">
              H
            </span>
            <span className="text-slate-600 font-medium">Hub Trung Tâm</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-600 inline-flex items-center justify-center text-[8px] font-bold text-white">
              D
            </span>
            <span className="text-slate-600 font-medium">Giao Hàng</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-flex items-center justify-center text-[8px] font-bold text-white">
              R
            </span>
            <span className="text-slate-600 font-medium">Thu Hồi PaaS (Strategy A/C)</span>
          </div>
        </div>
      </div>
      <div className="relative bg-slate-50" style={{ height }}>
        <div ref={ref} className="absolute inset-0" />
        {error && (
          <div className="absolute inset-0 bg-white/90 z-20 flex items-center justify-center text-center p-6">
            <div>
              <Info className="w-8 h-8 text-amber-500 mx-auto" />
              <p className="mt-2 text-sm text-slate-600">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
