import { createAdminClient } from "@/lib/supabase/admin";
import type { LocationPoint } from "./types";

export type MatrixCell = { distanceMeters: number; durationSeconds: number };
export type DistanceMatrixMap = Map<string, MatrixCell>;

const OSRM_BASE_URL = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";
const CACHE_TTL_DAYS = 30;

function formatLocationKey(lat: number, lng: number) {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

export function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 1.3);
}

export async function computeDistanceMatrix(
  points: LocationPoint[],
  travelMode = "DRIVE",
  routingPreference = "OSRM_FASTEST"
): Promise<DistanceMatrixMap> {
  const matrix: DistanceMatrixMap = new Map();
  if (points.length === 0) return matrix;

  const pairs: Array<{ i: number; j: number; fromKey: string; toKey: string }> = [];
  const keys = new Set<string>();
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < points.length; j++) {
      if (i === j) {
        matrix.set(`${i}-${j}`, { distanceMeters: 0, durationSeconds: 0 });
        continue;
      }
      const fromKey = formatLocationKey(points[i].lat, points[i].lng);
      const toKey = formatLocationKey(points[j].lat, points[j].lng);
      keys.add(fromKey);
      keys.add(toKey);
      pairs.push({ i, j, fromKey, toKey });
    }
  }

  const supabase = await createAdminClient();
  const nowIso = new Date().toISOString();
  const keyArray = Array.from(keys);
  if (keyArray.length) {
    const { data: cached } = await supabase
      .from("route_matrix_cache")
      .select("origin_key,destination_key,distance_meters,duration_seconds")
      .in("origin_key", keyArray)
      .in("destination_key", keyArray)
      .eq("travel_mode", travelMode)
      .eq("routing_preference", routingPreference)
      .gt("expires_at", nowIso);

    const cacheMap = new Map<string, { distance_meters: number; duration_seconds: number }>();
    for (const row of cached || []) cacheMap.set(`${row.origin_key}|${row.destination_key}`, row);
    for (const pair of pairs) {
      const hit = cacheMap.get(`${pair.fromKey}|${pair.toKey}`);
      if (hit) matrix.set(`${pair.i}-${pair.j}`, { distanceMeters: hit.distance_meters, durationSeconds: hit.duration_seconds });
    }
  }

  const needsRouting = pairs.some((pair) => !matrix.has(`${pair.i}-${pair.j}`));
  if (!needsRouting) return matrix;

  // Public OSRM is appropriate for low-volume demo/beta usage. Keep matrices small and cache results aggressively.
  if (points.length <= 25) {
    try {
      const coords = points.map((p) => `${p.lng},${p.lat}`).join(";");
      const res = await fetch(`${OSRM_BASE_URL}/table/v1/driving/${coords}?annotations=distance,duration`, {
        headers: { "User-Agent": "GreenBridgeAI/1.0" },
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { code?: string; distances?: Array<Array<number | null>>; durations?: Array<Array<number | null>> };
        if (data.code === "Ok" && data.distances && data.durations) {
          const inserts = [];
          for (let i = 0; i < points.length; i++) {
            for (let j = 0; j < points.length; j++) {
              if (i === j) continue;
              const distanceMeters = Math.round(data.distances[i]?.[j] ?? 0);
              const durationSeconds = Math.round(data.durations[i]?.[j] ?? 0);
              if (distanceMeters > 0 && durationSeconds > 0) {
                matrix.set(`${i}-${j}`, { distanceMeters, durationSeconds });
                inserts.push({
                  origin_key: formatLocationKey(points[i].lat, points[i].lng),
                  destination_key: formatLocationKey(points[j].lat, points[j].lng),
                  travel_mode: travelMode,
                  routing_preference: routingPreference,
                  departure_bucket: "DEFAULT",
                  distance_meters: distanceMeters,
                  duration_seconds: durationSeconds,
                  expires_at: new Date(Date.now() + CACHE_TTL_DAYS * 86400000).toISOString(),
                });
              }
            }
          }
          if (inserts.length) {
            await supabase.from("route_matrix_cache").upsert(inserts, {
              onConflict: "origin_key,destination_key,travel_mode,routing_preference,departure_bucket",
            });
          }
        }
      }
    } catch (error) {
      console.error("OSRM table request failed; using cached/Haversine fallback", error);
    }
  }

  for (const pair of pairs) {
    if (matrix.has(`${pair.i}-${pair.j}`)) continue;
    const meters = haversineDistanceMeters(points[pair.i].lat, points[pair.i].lng, points[pair.j].lat, points[pair.j].lng);
    matrix.set(`${pair.i}-${pair.j}`, {
      distanceMeters: meters,
      durationSeconds: Math.round((meters / 1000 / 25) * 3600),
    });
  }

  return matrix;
}
