/**
 * CMS admin UI shared types — Phase 13.5B.
 *
 * Client-safe: type-only imports (erased at compile) plus local interfaces.
 * No server-only runtime imports may ever be added here.
 */
import type { CmsPermission, CmsRole } from "@/lib/auth";
import type { CmsProvenanceType, CmsStatus } from "@/services/cms";

export type { CmsPermission, CmsRole, CmsProvenanceType, CmsStatus };

/**
 * CMS item as serialized over the 13.5A API (dates arrive as ISO strings).
 * The client treats author/reviewer ids as opaque display strings — they
 * are never sent back.
 */
export interface AdminCmsItem {
  readonly id: string;
  readonly contentType: string;
  readonly entityId: string | null;
  readonly title: string;
  readonly status: CmsStatus;
  readonly currentVersion: number;
  readonly stagedPayload: Record<string, unknown>;
  readonly sourceRef: string;
  readonly provenanceType: CmsProvenanceType;
  readonly originalSourceRef: string | null;
  readonly authorId: string;
  readonly reviewerId: string | null;
  readonly editorialNotes: string | null;
  readonly scheduledAt: string | null;
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Server-computed authorization snapshot for the verified actor.
 * Produced by the page (server component) from getCurrentActor() and
 * passed down for UX visibility only — the API re-authorizes everything.
 */
export interface ActorCapabilities {
  readonly actorId: string;
  readonly role: CmsRole;
  readonly permissions: readonly CmsPermission[];
  readonly isAdmin: boolean;
}
