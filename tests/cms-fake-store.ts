/**
 * In-memory CmsDatabase fake for Phase 13.3B service tests.
 *
 * Deterministic and disposable: no DATABASE_URL, no production contact.
 * Faithfully mirrors the production adapter's contract:
 * - transaction() snapshots state and restores it on ANY error (proves the
 *   service leaves content/version/audit unchanged on failure)
 * - insertContentVersion enforces unique(contentItemId, versionNumber)
 *   with the same 409 CmsError the Drizzle adapter maps from 23505
 */
import { CmsError } from "@/services/cms/errors";
import {
  generateTranslationId,
  normalizeTranslatedText,
} from "@/services/translation/translationService";
import type {
  CmsAuditInsert,
  CmsAuditRecord,
  CmsContentType,
  CmsDatabase,
  CmsItemInsert,
  CmsItemRecord,
  CmsStore,
  ListContentItemsFilter,
  VerifiedTranslationWrite,
  CmsVersionInsert,
  CmsVersionRecord,
} from "@/services/cms/types";

/** Mirrors the entity_translations row shape for 13.5C verification tests. */
export interface FakeTranslationRow {
  id: string;
  entityType: string;
  entityId: string;
  language: string;
  translatedText: string;
  secondaryText: string | null;
  contextNotes: string | null;
  sourceType: string;
  sourceRef: string | null;
  isVerified: boolean;
}

interface FakeState {
  items: Map<string, CmsItemRecord>;
  versions: Map<string, CmsVersionRecord>;
  audits: Map<string, CmsAuditRecord>;
  canonical: Map<string, Set<string>>;
  translations: Map<string, FakeTranslationRow>;
}

function snapshotState(state: FakeState): FakeState {
  // structuredClone handles Map, Set, and Date natively.
  return structuredClone(state);
}

function restoreState(state: FakeState, snap: FakeState): void {
  state.items = snap.items;
  state.versions = snap.versions;
  state.audits = snap.audits;
  state.canonical = snap.canonical;
  state.translations = snap.translations;
}

function asInsert<T>(row: T): T {
  return structuredClone(row);
}

export class FakeCmsStore implements CmsDatabase {
  private readonly state: FakeState = {
    items: new Map(),
    versions: new Map(),
    audits: new Map(),
    canonical: new Map(),
    translations: new Map(),
  };

  // ------------------------------------------------------- test seeding

  /** Seed a canonical entity so overlay publication guards can pass. */
  seedCanonicalEntity(contentType: string, entityId: string): void {
    const set = this.state.canonical.get(contentType) ?? new Set<string>();
    set.add(entityId);
    this.state.canonical.set(contentType, set);
  }

  /**
   * Insert an item row DIRECTLY, bypassing service validation — used to
   * simulate legacy/hand-mutated rows and prove promotion gates re-validate.
   */
  seedItemDirect(row: CmsItemInsert): void {
    this.state.items.set(row.id, asInsert(row as CmsItemRecord));
  }

  /**
   * Insert a translation row DIRECTLY (e.g. a pre-existing machine row),
   * bypassing verification — proves upgrades preserve text and identity.
   */
  seedTranslationDirect(row: FakeTranslationRow): void {
    this.state.translations.set(row.id, asInsert(row));
  }

  getTranslation(id: string): FakeTranslationRow | null {
    return structuredClone(this.state.translations.get(id) ?? null);
  }

  listTranslations(): FakeTranslationRow[] {
    return [...this.state.translations.values()].map((row) =>
      structuredClone(row)
    );
  }

  // ------------------------------------------------------- CmsStore port

  async getContentItem(id: string): Promise<CmsItemRecord | null> {
    return structuredClone(this.state.items.get(id) ?? null);
  }

  async listContentItems(
    filter: ListContentItemsFilter
  ): Promise<CmsItemRecord[]> {
    const needle = filter.q?.toLowerCase();
    return [...this.state.items.values()]
      .filter(
        (item) =>
          (filter.contentType === undefined ||
            item.contentType === filter.contentType) &&
          (filter.status === undefined || item.status === filter.status) &&
          (needle === undefined ||
            item.title.toLowerCase().includes(needle))
      )
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(filter.offset, filter.offset + filter.limit)
      .map((item) => structuredClone(item));
  }

  async insertContentItem(row: CmsItemInsert): Promise<void> {
    this.state.items.set(row.id, asInsert(row as CmsItemRecord));
  }

  async updateContentItem(
    id: string,
    patch: Partial<CmsItemInsert> & { updatedAt: Date }
  ): Promise<void> {
    const current = this.state.items.get(id);
    if (!current) return;
    this.state.items.set(id, { ...structuredClone(current), ...asInsert(patch) });
  }

  async insertContentVersion(row: CmsVersionInsert): Promise<void> {
    const key = `${row.contentItemId}:${row.versionNumber}`;
    if (this.state.versions.has(key)) {
      throw CmsError.versionConflict(row.versionNumber, row.versionNumber);
    }
    this.state.versions.set(key, asInsert(row as CmsVersionRecord));
  }

  async listContentVersions(itemId: string): Promise<CmsVersionRecord[]> {
    return [...this.state.versions.values()]
      .filter((v) => v.contentItemId === itemId)
      .sort((a, b) => a.versionNumber - b.versionNumber)
      .map((v) => structuredClone(v));
  }

  async insertAuditEvent(row: CmsAuditInsert): Promise<void> {
    this.state.audits.set(row.id, asInsert(row as CmsAuditRecord));
  }

  async listAuditEvents(itemId: string): Promise<CmsAuditRecord[]> {
    return [...this.state.audits.values()]
      .filter((a) => a.contentItemId === itemId)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .map((a) => structuredClone(a));
  }

  async canonicalEntityExists(
    contentType: CmsContentType,
    entityId: string
  ): Promise<boolean> {
    return this.state.canonical.get(contentType)?.has(entityId) ?? false;
  }

  async upsertVerifiedTranslation(
    input: VerifiedTranslationWrite
  ): Promise<{ id: string }> {
    // Mirrors TranslationService.addTranslation exactly (same pure
    // helpers, same conflict semantics): NFC text, deterministic id,
    // provided notes overwrite, verification ratchets up, text is never
    // rewritten in place.
    const normalizedText = normalizeTranslatedText(input.translatedText);
    const id = generateTranslationId(
      input.entityType,
      input.entityId,
      input.language,
      normalizedText
    );
    const existing = this.state.translations.get(id);
    if (existing) {
      existing.secondaryText = input.secondaryText
        ? input.secondaryText
        : existing.secondaryText;
      existing.contextNotes = input.contextNotes
        ? input.contextNotes
        : existing.contextNotes;
      existing.sourceType = "verified_human";
      existing.isVerified = true;
      return { id };
    }
    this.state.translations.set(id, {
      id,
      entityType: input.entityType,
      entityId: input.entityId,
      language: input.language,
      translatedText: normalizedText,
      secondaryText: input.secondaryText,
      contextNotes: input.contextNotes,
      sourceType: "verified_human",
      sourceRef: input.sourceRef,
      isVerified: true,
    });
    return { id };
  }

  async transaction<T>(fn: (tx: CmsStore) => Promise<T>): Promise<T> {
    const snap = snapshotState(this.state);
    try {
      return await fn(this);
    } catch (error) {
      restoreState(this.state, snap);
      throw error;
    }
  }
}

/**
 * Fault-injecting wrapper: runs every operation against the inner store
 * except the named one, which throws. Proves transaction atomicity: when a
 * late write fails, earlier writes in the same unit of work roll back.
 */
export class FailingCmsStore implements CmsDatabase {
  constructor(
    private readonly inner: CmsDatabase,
    private readonly failOn:
      | "insertAuditEvent"
      | "insertContentVersion"
      | "upsertVerifiedTranslation"
  ) {}

  getContentItem(id: string) {
    return this.inner.getContentItem(id);
  }
  listContentItems(filter: ListContentItemsFilter) {
    return this.inner.listContentItems(filter);
  }
  insertContentItem(row: CmsItemInsert) {
    return this.inner.insertContentItem(row);
  }
  updateContentItem(id: string, patch: Partial<CmsItemInsert> & { updatedAt: Date }) {
    return this.inner.updateContentItem(id, patch);
  }
  insertContentVersion(row: CmsVersionInsert) {
    if (this.failOn === "insertContentVersion") {
      return Promise.reject(new Error("injected version-write failure"));
    }
    return this.inner.insertContentVersion(row);
  }
  listContentVersions(itemId: string) {
    return this.inner.listContentVersions(itemId);
  }
  insertAuditEvent(row: CmsAuditInsert) {
    if (this.failOn === "insertAuditEvent") {
      return Promise.reject(new Error("injected audit-write failure"));
    }
    return this.inner.insertAuditEvent(row);
  }
  listAuditEvents(itemId: string) {
    return this.inner.listAuditEvents(itemId);
  }
  canonicalEntityExists(contentType: CmsContentType, entityId: string) {
    return this.inner.canonicalEntityExists(contentType, entityId);
  }
  upsertVerifiedTranslation(input: VerifiedTranslationWrite) {
    if (this.failOn === "upsertVerifiedTranslation") {
      return Promise.reject(new Error("injected translation-write failure"));
    }
    return this.inner.upsertVerifiedTranslation(input);
  }
  transaction<T>(fn: (tx: CmsStore) => Promise<T>): Promise<T> {
    // The failure must fire INSIDE the transaction: wrap the inner tx
    // handle so the service's transactional writes hit the fault.
    return this.inner.transaction((innerTx) => {
      const failingTx: CmsStore = {
        getContentItem: (id) => innerTx.getContentItem(id),
        listContentItems: (filter) => innerTx.listContentItems(filter),
        insertContentItem: (row) => innerTx.insertContentItem(row),
        updateContentItem: (id, patch) =>
          innerTx.updateContentItem(id, patch),
        insertContentVersion: (row) =>
          this.failOn === "insertContentVersion"
            ? Promise.reject(new Error("injected version-write failure"))
            : innerTx.insertContentVersion(row),
        listContentVersions: (itemId) => innerTx.listContentVersions(itemId),
        insertAuditEvent: (row) =>
          this.failOn === "insertAuditEvent"
            ? Promise.reject(new Error("injected audit-write failure"))
            : innerTx.insertAuditEvent(row),
        listAuditEvents: (itemId) => innerTx.listAuditEvents(itemId),
        canonicalEntityExists: (contentType, entityId) =>
          innerTx.canonicalEntityExists(contentType, entityId),
        upsertVerifiedTranslation: (input) =>
          this.failOn === "upsertVerifiedTranslation"
            ? Promise.reject(new Error("injected translation-write failure"))
            : innerTx.upsertVerifiedTranslation(input),
      };
      return fn(failingTx);
    });
  }
}
