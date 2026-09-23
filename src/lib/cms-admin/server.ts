import "server-only";

import { getCurrentActor, rolePermissions } from "@/lib/auth";
import type { ActorCapabilities } from "./types";

/**
 * Server-side admin gate — Phase 13.5B.
 *
 * Resolves the verified actor and derives the capability snapshot the UI
 * uses for control visibility. Runs in Server Components only. Returns a
 * gate decision instead of throwing so pages can render friendly states.
 */
export async function getAdminCapabilities(): Promise<
  | { ok: true; capabilities: ActorCapabilities }
  | { ok: false; reason: "unauthenticated" | "forbidden"; role?: string }
> {
  const actor = await getCurrentActor();
  if (!actor) {
    return { ok: false, reason: "unauthenticated" };
  }
  const permissions = rolePermissions(actor.role);
  if (!permissions.includes("cms.read")) {
    return { ok: false, reason: "forbidden", role: actor.role };
  }
  return {
    ok: true,
    capabilities: {
      actorId: actor.id,
      role: actor.role,
      permissions: [...permissions],
      isAdmin: actor.role === "admin",
    },
  };
}
