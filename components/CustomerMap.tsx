"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Info } from "lucide-react";

export interface MapPickupPoint {
  id: string;
  address: string;
  lat: number;
  lng: number;
  status: string;
  packaging_type: string;
  quantity_kg?: number;
  pickup_date?: string;
}

interface CustomerMapProps {
  pickups: MapPickupPoint[];
}

export function CustomerMap({ pickups }: CustomerMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const [selectedPickup, setSelectedPickup] = useState<MapPickupPoint | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState("");

  const filteredPickups = pickups.filter((p) => {
    if (filterStatus === "active") return ["pending", "scheduled", "assigned", "collecting"].includes(p.status);
    if (filterStatus === "completed") return p.status === "completed";
    return true;
  });

  useEffect(() => {
    // Dynamically load Leaflet CSS and JS if not already loaded
    if (typeof window === "undefined") return;

    const loadLeaflet = async () => {
      if (!(window as unknown as { L?: unknown }).L) {
        if (!document.getElementById("leaflet-css")) {
          const link = document.createElement("link");
          link.id = "leaflet-css";
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(link);
        }

        if (!document.getElementById("leaflet-js")) {
          const script = document.createElement("script");
          script.id = "leaflet-js";
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          script.onload = () => initMap();
          script.onerror = () => setMapError("Không tải được thư viện bản đồ. Vui lòng kiểm tra kết nối mạng.");
          document.body.appendChild(script);
          return;
        }
      }

      initMap();
    };

    const initMap = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).L;

      if (!L || !mapContainerRef.current) return;

      // Clean up old map if exists
      if (mapInstanceRef.current) {
        try {
          (mapInstanceRef.current as { remove: () => void }).remove();
        } catch {
          // ignore
        }
        mapInstanceRef.current = null;
      }

      // Default center: Ho Chi Minh City or Hanoi
      const validPoints = filteredPickups.filter(
        (p) => !isNaN(p.lat) && !isNaN(p.lng) && p.lat !== 0 && p.lng !== 0
      );

      const defaultLat = validPoints.length > 0 ? validPoints[0].lat : 10.7769;
      const defaultLng = validPoints.length > 0 ? validPoints[0].lng : 106.7009;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map: any = L.map(mapContainerRef.current).setView([defaultLat, defaultLng], 12);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      const bounds: [number, number][] = [];

      validPoints.forEach((p) => {
        const isCompleted = p.status === "completed";
        const colorClass = isCompleted ? "bg-emerald-600" : "bg-amber-500";
        const borderClass = isCompleted ? "border-emerald-200" : "border-amber-200";

        const iconHtml = `
          <div class="w-7 h-7 ${colorClass} ${borderClass} border-2 text-white rounded-full flex items-center justify-center shadow-md font-bold text-xs">
            ${isCompleted ? "✓" : "•"}
          </div>
        `;

        const customIcon = L.divIcon({
          className: "custom-leaflet-marker",
          html: iconHtml,
          iconSize: [28, 28],
        });

        const marker = L.marker([p.lat, p.lng], { icon: customIcon }).addTo(map);
        bounds.push([p.lat, p.lng]);

        marker.on("click", () => {
          setSelectedPickup(p);
        });

        const popup = document.createElement("div");
        popup.style.fontFamily = "Inter, system-ui, sans-serif";
        popup.style.padding = "4px";
        const title = document.createElement("div");
        title.style.fontWeight = "600";
        title.style.fontSize = "13px";
        title.textContent = p.packaging_type;
        const address = document.createElement("div");
        address.style.fontSize = "11px";
        address.style.color = "#64748B";
        address.style.marginTop = "3px";
        address.textContent = p.address;
        const meta = document.createElement("div");
        meta.style.fontSize = "11px";
        meta.style.marginTop = "5px";
        meta.textContent = `Trạng thái: ${p.status} · Trọng lượng: ${p.quantity_kg || 0} kg`;
        popup.append(title, address, meta);
        marker.bindPopup(popup);
      });

      if (bounds.length > 1) {
        map.fitBounds(bounds);
      }

      setIsMapLoaded(true);
    };

    loadLeaflet();
  }, [filteredPickups]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
      {/* Map Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center">
            <MapPin className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">Bản Đồ Địa Điểm Thu Gom</h3>
            <p className="text-[11px] text-slate-500">
              Vị trí điểm hẹn thu gom bao bì tái chế của bạn
            </p>
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
          <button
            onClick={() => setFilterStatus("all")}
            className={`px-3 py-1 rounded-md font-medium transition ${
              filterStatus === "all"
                ? "bg-white text-slate-900 shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Tất cả ({pickups.length})
          </button>
          <button
            onClick={() => setFilterStatus("active")}
            className={`px-3 py-1 rounded-md font-medium transition ${
              filterStatus === "active"
                ? "bg-white text-emerald-700 shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Đang xử lý ({pickups.filter((p) => ["pending", "scheduled", "assigned", "collecting"].includes(p.status)).length})
          </button>
          <button
            onClick={() => setFilterStatus("completed")}
            className={`px-3 py-1 rounded-md font-medium transition ${
              filterStatus === "completed"
                ? "bg-white text-emerald-700 shadow-2xs font-semibold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Hoàn thành ({pickups.filter((p) => p.status === "completed").length})
          </button>
        </div>
      </div>

      {/* Map Canvas */}
      <div className="relative w-full h-[360px] bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* Legend Overlay */}
        <div className="absolute bottom-3 left-3 z-20 bg-white/90 backdrop-blur-xs border border-slate-200 rounded-lg p-2.5 shadow-2xs text-[11px] space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
            <span className="text-slate-700 font-medium">Thu gom thành công</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
            <span className="text-slate-700 font-medium">Yêu cầu đang chờ / xử lý</span>
          </div>
        </div>

        {/* Selected Pickup Popover */}
        {selectedPickup && (
          <div className="absolute top-3 right-3 z-20 max-w-xs bg-white border border-slate-200 rounded-xl p-3 shadow-lg text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900">{selectedPickup.packaging_type}</span>
              <button
                onClick={() => setSelectedPickup(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>
            <p className="text-slate-500 line-clamp-2">{selectedPickup.address}</p>
            <div className="pt-1 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Trọng lượng: <b>{selectedPickup.quantity_kg || 0} kg</b></span>
              <span className={`px-2 py-0.5 rounded-md font-medium ${
                selectedPickup.status === "completed"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}>
                {selectedPickup.status}
              </span>
            </div>
          </div>
        )}

        {mapError && (
          <div className="absolute inset-0 z-30 bg-white/90 flex items-center justify-center p-6 text-center">
            <div><Info className="w-8 h-8 text-amber-500 mx-auto" /><div className="mt-2 text-sm font-semibold text-slate-800">Bản đồ chưa tải được</div><p className="mt-1 text-xs text-slate-500">{mapError}</p></div>
          </div>
        )}

        {/* Empty State overlay if no pickups */}
        {pickups.length === 0 && isMapLoaded && !mapError && (
          <div className="absolute inset-0 z-20 bg-white/70 backdrop-blur-2xs flex flex-col items-center justify-center p-4 text-center">
            <Info className="w-8 h-8 text-slate-400 mb-2" />
            <h4 className="font-semibold text-slate-800 text-xs">Chưa Có Địa Điểm Thu Gom</h4>
            <p className="text-slate-500 text-[11px] max-w-xs mt-0.5">
              Bạn chưa tạo yêu cầu thu gom bao bì tái chế nào. Bản đồ sẽ tự động hiển thị vị trí khi bạn tạo yêu cầu.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
