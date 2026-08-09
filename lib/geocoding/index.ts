import { AppError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";

export type GeocodeResult = { address: string; formattedAddress: string; lat: number; lng: number; placeId?: string };
const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL || "https://nominatim.openstreetmap.org";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
function normalizeAddress(value: string) { return value.trim().toLowerCase().replace(/\s+/g, " "); }

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const query = address?.trim();
  if (!query) throw new AppError("Địa chỉ không được để trống", "INVALID_ADDRESS", 400);
  const addressKey = normalizeAddress(query);

  try {
    const admin = createAdminClient();
    const { data: cached } = await admin.from("geocoding_cache").select("*").eq("address_key", addressKey).gt("expires_at", new Date().toISOString()).maybeSingle();
    if (cached) return { address: query, formattedAddress: cached.formatted_address, lat: Number(cached.lat), lng: Number(cached.lng), placeId: cached.place_id ?? undefined };

    const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "1", countrycodes: "vn", addressdetails: "1" });
    const res = await fetch(`${NOMINATIM_BASE_URL}/search?${params.toString()}`, {
      headers: { "User-Agent": `GreenBridgeAI/1.0 (${APP_URL})`, "Accept-Language": "vi,en;q=0.8" }, cache: "no-store"
    });
    if (!res.ok) throw new AppError("Dịch vụ bản đồ đang tạm thời không khả dụng", "GEOCODING_UPSTREAM_ERROR", 502);
    const data = await res.json() as Array<{lat:string;lon:string;display_name?:string;place_id?:number|string}>;
    const first = data[0];
    if (!first) throw new AppError(`Không tìm thấy tọa độ cho địa chỉ "${query}"`, "GEOCODING_NOT_FOUND", 400);
    const result: GeocodeResult = { address: query, formattedAddress: first.display_name || query, lat: Number(Number(first.lat).toFixed(6)), lng: Number(Number(first.lon).toFixed(6)), placeId: first.place_id != null ? String(first.place_id) : undefined };
    await admin.from("geocoding_cache").upsert({ address_key: addressKey, query_address: query, formatted_address: result.formattedAddress, lat: result.lat, lng: result.lng, provider: "nominatim", place_id: result.placeId ?? null, expires_at: new Date(Date.now()+180*86400_000).toISOString(), updated_at: new Date().toISOString() }, { onConflict: "address_key" });
    return result;
  } catch (error: unknown) {
    if (error instanceof AppError) throw error;
    throw new AppError("Không thể kết nối dịch vụ geocoding OpenStreetMap", "GEOCODING_ERROR", 502, error);
  }
}
