/**
 * Drizzle PublicationStore — Phase 13.5F.
 *
 * The production published-content port: one bounded, parameterized
 * query with hardcoded `contentType = 'dictionary' AND status =
 * 'published'` predicates. Publication is derived here, never from
 * caller input. Selects only the learner-safe projection.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cmsContentItems } from "@/db/schema";
import type {
  PublicationStore,
  PublishedDictionaryOverride,
} from "./types";

type Executor = typeof db;

export function createDrizzlePublicationStore(
  executor: Executor = db
): PublicationStore {
  return {
    async findPublishedDictionaryOverrides(
      entityIds: readonly string[]
    ): Promise<PublishedDictionaryOverride[]> {
      if (entityIds.length === 0) return [];
      const rows = await executor
        .select({
          entityId: cmsContentItems.entityId,
          sourceRef: cmsContentItems.sourceRef,
          provenanceType: cmsContentItems.provenanceType,
          stagedPayload: cmsContentItems.stagedPayload,
        })
        .from(cmsContentItems)
        .where(
          and(
            eq(cmsContentItems.contentType, "dictionary"),
            eq(cmsContentItems.status, "published"),
            inArray(cmsContentItems.entityId, [...entityIds])
          )
        );
      // CMS-originated items (entityId null) are excluded: without a
      // canonical identity there is nothing to overlay.
      return rows.flatMap((row): PublishedDictionaryOverride[] =>
        row.entityId === null
          ? []
          : [
              {
                entityId: row.entityId,
                sourceRef: row.sourceRef,
                provenanceType: row.provenanceType,
                stagedPayload: row.stagedPayload,
              },
            ]
      );
    },
  };
}

/** Production singleton (lazy: no query runs before first use). */
export const defaultPublicationStore: PublicationStore =
  createDrizzlePublicationStore();
