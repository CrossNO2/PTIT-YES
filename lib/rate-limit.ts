import { createClient } from "@/lib/supabase/server";

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

export async function checkRateLimit(scope: string, options: RateLimitOptions = {}) {
  const windowSeconds = Math.max(1, Math.round((options.windowMs ?? 60_000) / 1000));
  const max = options.max ?? 20;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_scope: scope,
    p_window_seconds: windowSeconds,
    p_max_requests: max,
  });
  if (error) throw error;
  const result = data as { success?: boolean; remaining?: number; reset_at?: string } | null;
  return {
    success: result?.success === true,
    remaining: Number(result?.remaining ?? 0),
    resetAt: result?.reset_at ?? null,
  };
}
