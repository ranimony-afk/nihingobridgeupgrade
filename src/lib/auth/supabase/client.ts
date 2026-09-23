import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client — Phase 13.4C-1.
 *
 * Official @supabase/ssr browser pattern. Deliberately NOT marked
 * `server-only`: future login/logout UI runs in the browser. It carries only
 * the public project URL + publishable key, which are designed for client
 * exposure and grant no privileges by themselves. No privileged server
 * keys may ever be referenced here.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
