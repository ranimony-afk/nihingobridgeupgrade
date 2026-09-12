/**
 * Repository layer contract.
 *
 * INTEGRATION_BOUNDARIES §2.1:
 *   - A repository owns Drizzle access for its own tables and nothing else.
 *   - Repositories never perform HTTP work and never read another domain's
 *     tables; cross-domain reads go through that domain's service.
 *   - Route handlers never talk to repositories directly.
 *
 * Concrete repositories are added by the phase that owns their tables.
 */

import type { EntityId, PageRequest, Paginated } from "@/types/domain";

/** Read access to a single table keyed by text primary key. */
export interface ReadRepository<TEntity> {
  findById(id: EntityId): Promise<TEntity | null>;
  list(request: PageRequest): Promise<Paginated<TEntity>>;
}

/** Write access. `TInsert` is normally the Drizzle inferred insert type. */
export interface WriteRepository<TEntity, TInsert> {
  create(values: TInsert): Promise<TEntity>;
  update(id: EntityId, values: Partial<TInsert>): Promise<TEntity | null>;
}

/**
 * Idempotent upsert for ETL-loaded rows, keyed by (source, sourceId).
 * Implementations must skip writes when the checksum is unchanged.
 */
export interface UpsertRepository<TInsert> {
  upsertBySource(values: TInsert[]): Promise<UpsertOutcome>;
}

export interface UpsertOutcome {
  inserted: number;
  updated: number;
  skipped: number;
}

export function emptyUpsertOutcome(): UpsertOutcome {
  return { inserted: 0, updated: 0, skipped: 0 };
}
