/**
 * CMS review workspace view-model types — Phase 13.5D-2.
 *
 * Client-safe UI view models only. Domain truth stays in the CMS service
 * and the 13.5A/13.5D-1 APIs; these shapes mirror their JSON wire format
 * (dates arrive as ISO strings). No server-only imports may be added here.
 */
import type {
  AdminCmsItem,
  CmsProvenanceType,
  CmsStatus,
} from "@/lib/cms-admin/types";

export type { AdminCmsItem, CmsProvenanceType, CmsStatus };

/** One normalized queue row across both CMS slices. */
export interface ReviewQueueItem {
  readonly id: string;
  readonly contentType: string;
  readonly title: string;
  readonly entityId: string | null;
  readonly status: CmsStatus;
  readonly currentVersion: number;
  readonly authorId: string;
  readonly reviewerId: string | null;
  readonly provenanceType: CmsProvenanceType;
  readonly sourceRef: string;
  readonly updatedAt: string;
}

/** One immutable version record (13.5D-1 wire shape). */
export interface ReviewVersion {
  readonly id: string;
  readonly contentItemId: string;
  readonly versionNumber: number;
  readonly snapshotPayload: Record<string, unknown>;
  readonly statusAtSnapshot: string;
  readonly createdById: string;
  readonly changeSummary: string;
  readonly createdAt: string;
}

/** One audit event (13.5D-1 sanitized wire shape — never has ipAddress). */
export interface ReviewAuditEvent {
  readonly id: string;
  readonly contentItemId: string | null;
  readonly actorId: string;
  readonly action: string;
  readonly details: Record<string, unknown>;
  readonly occurredAt: string;
}

/** Tolerant read of a translation staged payload for the preview panel. */
export interface TranslationProposal {
  readonly entityType: string;
  readonly language: string;
  readonly translatedText: string;
  readonly secondaryText: string | null;
  readonly contextNotes: string | null;
  readonly sourceRef: string | null;
}

export type ReviewQueueTab = "review" | "approved";
export type ReviewTypeFilter = "all" | "dictionary" | "translation";
