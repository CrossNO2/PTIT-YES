import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/auth/require-user";
import { formatErrorResponse, jsonError } from "@/lib/errors";

const schema = z.object({
  coordinates: z.array(z.object({ lat: z.number(), lng: z.number() })).min(2).max(25),
});
const OSRM_BASE_URL = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const rate = await checkRateLimit("routing_geometry", { max: 30, windowMs: 60_000 });
    if (!rate.success) return jsonError("Quá nhiều yêu cầu dựng tuyến. Vui lòng thử lại sau.", "RATE_LIMITED", 429);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return jsonError("Tọa độ tuyến không hợp lệ", "INVALID_ROUTE_COORDINATES", 400);
    const coords = parsed.data.coordinates.map((p) => `${p.lng},${p.lat}`).join(";");
    const res = await fetch(`${OSRM_BASE_URL}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`, {
      headers: { "User-Agent": "GreenBridgeAI/1.0" },
      cache: "no-store",
    });
    if (!res.ok) return jsonError("OSRM không thể dựng hình học tuyến", "ROUTING_UPSTREAM_ERROR", 502);
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return jsonError("Không tìm thấy tuyến đường phù hợp", "ROUTE_NOT_FOUND", 404);
    return NextResponse.json({ success: true, data: { geometry: route.geometry, distance_meters: route.distance, duration_seconds: route.duration } });
  } catch (error: unknown) {
    const { status, body } = formatErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
