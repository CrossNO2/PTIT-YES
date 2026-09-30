import { NextResponse } from "next/server";

export async function GET() {
  const isSupabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );

  return NextResponse.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "2.0.0",
    service: "GreenBridge PaaS Logistics & Operations",
    environment: {
      node_env: process.env.NODE_ENV || "development",
      supabase_configured: isSupabaseConfigured,
    },
  });
}
