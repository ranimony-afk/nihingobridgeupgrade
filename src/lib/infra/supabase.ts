import { logger } from "./logger";

export function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

export async function getSupabase() {
  if (!supabaseConfigured()) return null;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    return createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (error) {
    logger.warn("supabase.unavailable", { msg: error instanceof Error ? error.message : "client failed" });
    return null;
  }
}

export async function pingSupabase() {
  if (!supabaseConfigured()) {
    return { configured: false, ok: true, status: "not_configured" };
  }
  const client = await getSupabase();
  if (!client) return { configured: true, ok: false, status: "down" };
  try {
    const { error } = await client.from("units").select("id").limit(1);
    if (error && /relation|schema cache|Could not find/i.test(error.message)) {
      return { configured: true, ok: true, status: "up" };
    }
    if (error) return { configured: true, ok: false, status: "down" };
    return { configured: true, ok: true, status: "up" };
  } catch {
    return { configured: true, ok: true, status: "reachable" };
  }
}
