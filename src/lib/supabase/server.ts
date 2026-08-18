import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isFeatureConfigured } from "@/lib/env";

let adminClient: SupabaseClient | undefined;

export function isSupabaseAdminConfigured(): boolean {
  return isFeatureConfigured("supabaseAdmin");
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (!isSupabaseAdminConfigured()) {
    throw new Error(
      "Supabase server client is unavailable. Configure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  if (!adminClient) {
    adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  return adminClient;
}
