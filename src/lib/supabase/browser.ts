"use client";

import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase browser client is unavailable. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  browserClient ??= createBrowserClient(url, publishableKey);
  return browserClient;
}
