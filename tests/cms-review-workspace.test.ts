/**
 * Phase 13.5D-2 — CMS review workspace tests.
 *
 * The repository has no DOM test harness (vitest runs in node), so the
 * workspace is verified at the layers the repo supports, following the
 * 13.5B pattern: the pure queue/detail/diff/audit logic components
 * render from, live route probes for slice resolution, and static
 * guards proving the UI carries no identity channel, no cross-slice
 * disclosure, no IP rendering, and verify-only translation routing.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

import {
  resetActorResolver,
  rolePermissions,
  setActorResolver,
} from "@/lib/auth";
import type { CmsRole } from "@/lib/auth";
import { visibleActions } from "@/lib/cms-admin/actions";
import type { CmsActionId } from "@/lib/cms-admin/actions";
import {
  VERSION_CONFLICT_MESSAGE,
  interpretApiResponse,
} from "@/lib/cms-admin/api";
import type { AdminCmsItem } from "@/lib/cms-admin/types";
import { getAdminCapabilities } from "@/lib/cms-admin/server";
import {
  getCmsService,
  resetCmsDatabaseOverride,
  setCmsDatabaseOverride,
} from "@/services/cms";
import { FakeCmsStore } from "./cms-fake-store";
import { GET as dictionaryGET } from "@/app/api/cms/dictionary/[id]/route";
import { GET as translationsGET } from "@/app/api/cms/translations/[id]/route";

import {
  buildQueueListUrl,
  mergeQueueResults,
  slicesForFilter,
} from "@/lib/cms-review/queue";
import {
  resolveActionTarget,
  reviewDetailActions,
  shouldTryOtherSlice,
} from "@/lib/cms-review/detail";
import {
  changedEntries,
  diffSnapshots,
} from "@/lib/cms-review/diff";
import {
  formatAuditAction,
  sortAuditChronological,
  stripIpAddress,
  summarizeAuditDetails,
} from "@/lib/cms-review/audit";
import { parseTranslationProposal } from "@/lib/cms-review/translation";
import type {
  ReviewAuditEvent,
  ReviewQueueTab,
} from "@/lib/cms-review/types";

const REVIEW_QUEUE = "src/components/cms-review/ReviewQueue.tsx";
const REVIEW_DETAIL = "src/components/cms-review/ReviewDetail.tsx";
const PREVIEWS = "src/components/cms-review/previews.tsx";
const VERSION_DIFF = "src/components/cms-review/VersionDiff.tsx";
const AUDIT_TIMELINE = "src/components/cms-review/AuditTimeline.tsx";
const REVIEW_LIB = [
  "src/lib/cms-review/types.ts",
  "src/lib/cms-review/queue.ts",
  "src/lib/cms-review/detail.ts",
  "src/lib/cms-review/diff.ts",
  "src/lib/cms-review/audit.ts",
  "src/lib/cms-review/translation.ts",
];
const REVIEW_COMPONENTS = [
  REVIEW_QUEUE,
  REVIEW_DETAIL,
  PREVIEWS,
  VERSION_DIFF,
  AUDIT_TIMELINE,
];

function codeOf(path: string): string {
  return readFileSync(path, "utf8");
}

function itemFixture(overrides: Partial<AdminCmsItem> = {}): AdminCmsItem {
  return {
    id: "item-1",
    contentType: "dictionary",
    entityId: null,
    title: "water",
    status: "review",
    currentVersion: 1,
    stagedPayload: { headword: "水" },
    sourceRef: "first-party:test:v1",
    provenanceType: "editorial_curated",
    originalSourceRef: null,
    authorId: "editor-1",
    reviewerId: null,
    editorialNotes: null,
    scheduledAt: null,
    publishedAt: null,
    archivedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

function auditFixture(overrides: Partial<ReviewAuditEvent> = {}): ReviewAuditEvent {
  return {
    id: "audit-1",
    contentItemId: "item-1",
    actorId: "reviewer-1",
    action: "approve",
    details: {},
    occurredAt: "2026-01-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("13.5D-2 queue: server gate (tests 1-4)", () => {
  beforeEach(() => resetActorResolver());

  it("1. anonymous → unauthenticated gate", async () => {
    setActorResolver(() => null);
    expect(await getAdminCapabilities()).toMatchObject({
      ok: false,
      reason: "unauthenticated",
    });
  });

  it("2. learner → forbidden gate", async () => {
    setActorResolver(() => ({ id: "learner-1", role: "learner" }));
    expect(await getAdminCapabilities()).toMatchObject({
      ok: false,
      reason: "forbidden",
    });
  });

  it("3-4. reviewer/admin → capabilities snapshot", async () => {
    for (const role of ["reviewer", "admin"] as const) {
      setActorResolver(() => ({ id: `${role}-1`, role }));
      const gate = await getAdminCapabilities();
      expect(gate.ok).toBe(true);
      if (gate.ok) {
        expect(gate.capabilities.role).toBe(role);
        expect(gate.capabilities.permissions).toContain("cms.read");
      }
    }
  });
});

describe("13.5D-2 queue: tabs, filters, search (tests 5-11)", () => {
  it("5-6. tabs request status=review / status=approved", () => {
    for (const tab of ["review", "approved"] as const) {
      const url = buildQueueListUrl("dictionary", tab satisfies ReviewQueueTab, "");
      expect(url).toContain(`status=${tab}`);
    }
  });

  it("7-9. type filter selects slice APIs", () => {
    expect(slicesForFilter("all")).toEqual(["dictionary", "translation"]);
    expect(slicesForFilter("dictionary")).toEqual(["dictionary"]);
    expect(slicesForFilter("translation")).toEqual(["translation"]);
  });

  it("10-11. search forwards q; reset drops it", () => {
    expect(buildQueueListUrl("dictionary", "review", "水")).toContain("q=");
    expect(buildQueueListUrl("dictionary", "review", "  ")).not.toContain("q=");
  });
});

describe("13.5D-2 queue: merge, empty states, navigation (tests 12-17)", () => {
  it("12-14. empty states exist per tab and per filter", () => {
    expect(mergeQueueResults([], [])).toEqual([]);
    const code = codeOf(REVIEW_QUEUE);
    expect(code).toContain("No content needs review.");
    expect(code).toContain("No approved content is waiting for disposition.");
    expect(code).toContain("No matching content found.");
  });

  it("15-16. slices merge newest-first", () => {
    const dict = itemFixture({
      id: "d1",
      contentType: "dictionary",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const trans = itemFixture({
      id: "t1",
      contentType: "translation",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    const merged = mergeQueueResults([dict], [trans]);
    expect(merged.map((row) => row.id)).toEqual(["t1", "d1"]);
    expect(merged[0]?.contentType).toBe("translation");
    expect(merged[1]?.contentType).toBe("dictionary");
  });

  it("17. queue links to /admin/review/[id]", () => {
    expect(codeOf(REVIEW_QUEUE)).toContain(
      "/admin/review/${encodeURIComponent(item.id)}"
    );
  });
});

describe("13.5D-2 detail: previews, metadata, loading (tests 18-23)", () => {
  it("18-20. preview dispatch by content type with generic fallback", () => {
    const code = codeOf(REVIEW_DETAIL);
    expect(code).toMatch(/contentType === "dictionary"[\s\S]*DictionaryReviewPreview/);
    expect(code).toMatch(/contentType === "translation"[\s\S]*TranslationReviewPreview/);
    expect(code).toContain("GenericReviewPreview");
    // Unreadable translation proposals degrade to the generic panel.
    expect(parseTranslationProposal({ nope: true })).toBeNull();
    expect(parseTranslationProposal(null)).toBeNull();
    expect(codeOf(PREVIEWS)).toMatch(
      /Preview unavailable[\s\S]*GenericReviewPreview/
    );
  });

  it("21. metadata panel covers the required fields", () => {
    const code = codeOf(REVIEW_DETAIL);
    for (const label of [
      "Content type",
      "Entity ID",
      "Current version",
      "Status",
      "Author",
      "Reviewer",
      "Provenance",
      "Source reference",
      "Created",
      "Updated",
      "Editorial notes",
    ]) {
      expect(code).toContain(label);
    }
    expect(code).toContain("Not assigned");
    expect(code).toContain("Not available");
  });

  it("22. missing item renders a clean not-found state", async () => {
    resetActorResolver();
    resetCmsDatabaseOverride();
    setCmsDatabaseOverride(new FakeCmsStore());
    setActorResolver(() => ({ id: "reviewer-1", role: "reviewer" }));
    const ctx = { params: Promise.resolve({ id: "missing-id" }) };
    const dictRes = await dictionaryGET(new Request("http://localhost/x"), ctx);
    const transRes = await translationsGET(new Request("http://localhost/x"), ctx);
    expect(dictRes.status).toBe(404);
    expect(transRes.status).toBe(404);
    expect(codeOf(REVIEW_DETAIL)).toContain("Content not found");
  });

  it("23. cross-slice ids resolve to their owning slice only", async () => {
    resetActorResolver();
    resetCmsDatabaseOverride();
    const store = new FakeCmsStore();
    setCmsDatabaseOverride(store);
    setActorResolver(() => ({ id: "editor-1", role: "editor" }));
    const service = getCmsService();
    const dict = await service.createDraft({
      contentType: "dictionary",
      entityId: null,
      title: "water",
      stagedPayload: { headword: "水" },
      sourceRef: "first-party:test:v1",
      provenanceType: "editorial_curated",
    });
    setActorResolver(() => ({ id: "reviewer-1", role: "reviewer" }));
    const ctx = { params: Promise.resolve({ id: dict.id }) };
    // Dictionary probe owns it; the translation probe 404s (slice scope).
    expect(
      (await dictionaryGET(new Request("http://localhost/x"), ctx)).status
    ).toBe(200);
    expect(
      (await translationsGET(new Request("http://localhost/x"), ctx)).status
    ).toBe(404);
    // Only a 404 may fall through to the other slice.
    expect(shouldTryOtherSlice("notFound")).toBe(true);
    for (const kind of ["unauthorized", "forbidden", "conflict", "validation", "server"] as const) {
      expect(shouldTryOtherSlice(kind)).toBe(false);
    }
  });
});

describe("13.5D-2 actions: visibility from the real matrix (tests 25-33)", () => {
  const perms = (role: CmsRole) => [...rolePermissions(role)];

  it("25. editor draft: submit in review (save lives in the editor)", () => {
    expect(
      visibleActions({
        permissions: perms("editor"),
        isAdmin: false,
        status: "draft",
        isAuthor: true,
      })
    ).toEqual(["save", "submit"]);
    expect(
      reviewDetailActions({
        permissions: perms("editor"),
        isAdmin: false,
        status: "draft",
        isAuthor: true,
        contentType: "dictionary",
      })
    ).toEqual(["submit"]);
  });

  it("26-27. reviewer review: approve hidden on own items", () => {
    const base = {
      permissions: perms("reviewer"),
      isAdmin: false,
      status: "review" as const,
    };
    expect(visibleActions({ ...base, isAuthor: false })).toEqual([
      "requestChanges",
      "approve",
    ]);
    expect(visibleActions({ ...base, isAuthor: true })).toEqual([
      "requestChanges",
    ]);
  });

  it("28. admin approved dictionary: schedule + publish, never verify", () => {
    const actions = reviewDetailActions({
      permissions: perms("admin"),
      isAdmin: true,
      status: "approved",
      isAuthor: false,
      contentType: "dictionary",
    });
    expect(actions).toContain("schedule");
    expect(actions).toContain("publish");
    expect(actions).not.toContain("verify");
  });

  it("29-31. approved translation: verify only, no publish/schedule", () => {
    for (const role of ["reviewer", "admin"] as const) {
      const actions = reviewDetailActions({
        permissions: perms(role),
        isAdmin: role === "admin",
        status: "approved",
        isAuthor: false,
        contentType: "translation",
      });
      expect(actions).toContain("verify");
      expect(actions).not.toContain("publish");
      expect(actions).not.toContain("schedule");
      expect(actions).not.toContain("archive");
      expect(actions).not.toContain("rollback");
    }
    expect(
      reviewDetailActions({
        permissions: perms("reviewer"),
        isAdmin: false,
        status: "approved",
        isAuthor: false,
        contentType: "translation",
      })
    ).toEqual(["verify"]);
  });

  it("32. published dictionary admin: archive/rollback per capability", () => {
    const actions = reviewDetailActions({
      permissions: perms("admin"),
      isAdmin: true,
      status: "published",
      isAuthor: false,
      contentType: "dictionary",
    });
    expect(actions).toContain("archive");
    expect(actions).toContain("rollback");
  });

  it("33. unauthorized actors see no actions", () => {
    expect(
      reviewDetailActions({
        permissions: perms("learner"),
        isAdmin: false,
        status: "review",
        isAuthor: false,
        contentType: "dictionary",
      })
    ).toEqual([]);
  });
});

describe("13.5D-2 verify routing (tests 34-39)", () => {
  it("34. approved translation resolves to the verify endpoint", () => {
    expect(resolveActionTarget("verify", "translation", "t1")).toEqual({
      url: "/api/cms/translations/t1/verify",
      method: "POST",
    });
    expect(resolveActionTarget("verify", "dictionary", "d1")).toBeNull();
  });

  it("35+40. mutations send the loaded expectedVersion", () => {
    expect(codeOf(REVIEW_DETAIL)).toContain(
      "body: { expectedVersion: item.currentVersion, ...extra }"
    );
  });

  it("36. verify confirmation shows the proposal + promotion warning", () => {
    const code = codeOf(REVIEW_DETAIL);
    expect(code).toContain("Translation being verified");
    expect(code).toContain("verifyProposal?.translatedText");
    expect(code).toContain(
      "This will promote the approved translation into"
    );
    expect(code).toContain("entity_translations.");
  });

  it("37. success refreshes item, versions, and audit", () => {
    const code = codeOf(REVIEW_DETAIL);
    expect(code).toMatch(/refreshAfterAction\(result\.data/);
    const refresh = code.slice(code.indexOf("const refreshAfterAction"));
    expect(refresh).toContain("setItem(fresh)");
    expect(refresh).toContain("/versions");
    expect(refresh).toContain("/audit");
  });

  it("38-39. translation can never target publish/schedule", () => {
    for (const action of [
      "schedule",
      "publish",
      "archive",
      "rollback",
      "save",
    ] as CmsActionId[]) {
      expect(resolveActionTarget(action, "translation", "t1")).toBeNull();
    }
    // Dictionary keeps its full disposition surface.
    expect(resolveActionTarget("publish", "dictionary", "d1")).toEqual({
      url: "/api/cms/dictionary/d1/publish",
      method: "POST",
    });
    expect(resolveActionTarget("schedule", "dictionary", "d1")).toEqual({
      url: "/api/cms/dictionary/d1/schedule",
      method: "POST",
    });
    // Unknown content types get no action targets at all.
    expect(resolveActionTarget("approve", "kanji", "k1")).toBeNull();
  });
});

describe("13.5D-2 concurrency (tests 41-46)", () => {
  it("41-42. 409 renders the exact copy with a reload action", () => {
    expect(VERSION_CONFLICT_MESSAGE).toBe(
      "This content was changed by another user. Reload before saving."
    );
    const mapped = interpretApiResponse(409, {
      success: false,
      error: { code: "VERSION_CONFLICT", message: "stale" },
    });
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) expect(mapped.failure.message).toBe(VERSION_CONFLICT_MESSAGE);
    const code = codeOf(REVIEW_DETAIL);
    expect(code).toContain("failure.kind === \"conflict\"");
    expect(code).toContain("Reload latest version");
  });

  it("43-45. reload refetches item, versions, and audit", () => {
    const code = codeOf(REVIEW_DETAIL);
    const load = code.slice(code.indexOf("const load = useCallback"));
    expect(load).toContain("CMS_DICTIONARY_API");
    expect(load).toContain("CMS_TRANSLATIONS_API");
    expect(load).toContain("/versions");
    expect(load).toContain("/audit");
  });

  it("46. failures never update local state optimistically", () => {
    const code = codeOf(REVIEW_DETAIL);
    const runAction = code.slice(code.indexOf("const runAction"));
    const failureBranch = runAction.slice(runAction.indexOf("} else if (modal) {"));
    expect(failureBranch).not.toContain("setItem(");
    expect(failureBranch).not.toContain("refreshAfterAction(");
  });
});

describe("13.5D-2 versions + diff (tests 47-57)", () => {
  it("47-49. newest-first history with current/previous selection", () => {
    const code = codeOf(REVIEW_DETAIL);
    expect(code).toContain("(a, b) => b.versionNumber - a.versionNumber");
    expect(code).toContain("No previous version available.");
    expect(code).toContain('htmlFor="review-diff-before"');
    expect(code).toContain('htmlFor="review-diff-after"');
    expect(code).toContain("setBeforeV(Number(e.target.value))");
    expect(code).toContain("setAfterV(Number(e.target.value))");
  });

  it("50. changed primitive detected", () => {
    expect(changedEntries(diffSnapshots({ a: 1 }, { a: 2 }))).toEqual([
      { path: "a", kind: "changed", before: 1, after: 2 },
    ]);
  });

  it("51-52. added and removed keys detected", () => {
    expect(changedEntries(diffSnapshots({ a: 1 }, { a: 1, b: 2 }))).toEqual([
      { path: "b", kind: "added", before: undefined, after: 2 },
    ]);
    expect(changedEntries(diffSnapshots({ a: 1, b: 2 }, { a: 1 }))).toEqual([
      { path: "b", kind: "removed", before: 2, after: undefined },
    ]);
  });

  it("53. nested change detected with dotted path", () => {
    expect(
      changedEntries(diffSnapshots({ o: { x: 1 } }, { o: { x: 2 } }))
    ).toEqual([{ path: "o.x", kind: "changed", before: 1, after: 2 }]);
  });

  it("54. array changes handled per index", () => {
    expect(
      changedEntries(diffSnapshots({ l: [1, 2] }, { l: [1, 3] }))
    ).toEqual([{ path: "l[1]", kind: "changed", before: 2, after: 3 }]);
    expect(changedEntries(diffSnapshots({ l: [1] }, { l: [1, 2] }))).toEqual([
      { path: "l[1]", kind: "added", before: undefined, after: 2 },
    ]);
  });

  it("55. null/value change handled", () => {
    expect(
      changedEntries(diffSnapshots({ a: null }, { a: "x" }))
    ).toEqual([{ path: "a", kind: "changed", before: null, after: "x" }]);
  });

  it("56. unchanged values not marked changed", () => {
    const entries = diffSnapshots({ a: 1, n: { x: true } }, { a: 1, n: { x: true } });
    expect(changedEntries(entries)).toEqual([]);
    expect(entries.every((e) => e.kind === "unchanged")).toBe(true);
  });

  it("57. diff is read-only", () => {
    const before = { a: 1, nested: { list: [1, 2] } };
    const after = { a: 2, nested: { list: [1] } };
    const snapshot = JSON.stringify({ before, after });
    diffSnapshots(before, after);
    expect(JSON.stringify({ before, after })).toBe(snapshot);
    // Frozen inputs must not throw either.
    diffSnapshots(Object.freeze({ a: 1 }), Object.freeze({ a: 2 }));
  });
});

describe("13.5D-2 audit timeline (tests 58-65)", () => {
  it("58-59. timeline renders chronologically", () => {
    const late = auditFixture({ id: "b", occurredAt: "2026-02-01T00:00:00.000Z" });
    const early = auditFixture({ id: "a", occurredAt: "2026-01-01T00:00:00.000Z" });
    expect(sortAuditChronological([late, early]).map((e) => e.id)).toEqual([
      "a",
      "b",
    ]);
    expect(formatAuditAction("submit_review")).toBe("Submitted for review");
    expect(formatAuditAction("verify_translation")).toBe("Verified translation");
  });

  it("60-63. transitions, reasons, overrides, translation details", () => {
    expect(
      summarizeAuditDetails({
        fromStatus: "review",
        toStatus: "approved",
        versionNumber: 3,
      })
    ).toMatchObject({ fromStatus: "review", toStatus: "approved", versionNumber: 3 });
    expect(summarizeAuditDetails({ reason: "fix gloss" })).toMatchObject({
      reason: "fix gloss",
    });
    expect(summarizeAuditDetails({ adminOverride: true })).toMatchObject({
      adminOverride: true,
    });
    expect(
      summarizeAuditDetails({
        entityType: "dictionary",
        language: "ta",
        translationId: "tr-1",
      })
    ).toMatchObject({
      entityType: "dictionary",
      language: "ta",
      translationId: "tr-1",
    });
  });

  it("64. IP addresses never render", () => {
    const cleaned = stripIpAddress({
      action: "edit",
      ipAddress: "9.9.9.9",
      nested: { ipAddress: "1.1.1.1", keep: 1 },
    });
    expect(JSON.stringify(cleaned)).not.toContain("ipAddress");
    expect(cleaned).toMatchObject({ action: "edit", nested: { keep: 1 } });
    expect(codeOf(AUDIT_TIMELINE)).toContain("stripIpAddress(event.details)");
    for (const file of REVIEW_COMPONENTS) {
      const stripped = codeOf(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\s)\/\/.*$/gm, "$1");
      expect(stripped).not.toContain("ipAddress");
    }
  });

  it("65. unknown detail fields do not crash rendering", () => {
    expect(() =>
      summarizeAuditDetails({ weird: { deep: [1, { x: null }] }, n: 5 })
    ).not.toThrow();
    expect(formatAuditAction("some_future_action")).toBe("Some Future Action");
  });
});

describe("13.5D-2 responsive + accessibility (tests 66-71)", () => {
  it("66-67. mobile cards and desktop table both render", () => {
    const code = codeOf(REVIEW_QUEUE);
    expect(code).toContain("md:hidden");
    expect(code).toContain("<article");
    expect(code).toContain("hidden md:block");
    expect(code).toContain("<table");
  });

  it("68-70. actions, modal, and links are keyboard/accessibly named", () => {
    const detail = codeOf(REVIEW_DETAIL);
    // Action buttons render text labels (no icon-only actions).
    expect(detail).toContain("{busy === action ? \"Working...\" : CMS_ACTION_META[action].label}");
    expect(detail).toContain('aria-label="Close dialog"');
    expect(detail).toContain("Cancel");
    const queue = codeOf(REVIEW_QUEUE);
    expect(queue).toContain("aria-label={`Open review for ${item.title}`}");
    expect(queue).toContain('aria-label="Review queue status"');
    expect(queue).toContain('aria-label="Search review queue by title"');
  });

  it("71. status is never color-alone", () => {
    // Diff kinds carry text labels; queue/detail use StatusBadge + words.
    expect(codeOf(VERSION_DIFF)).toContain("Added");
    expect(codeOf(VERSION_DIFF)).toContain("Removed");
    expect(codeOf(VERSION_DIFF)).toContain("Changed");
    expect(codeOf(REVIEW_QUEUE)).toContain("<StatusBadge status={item.status} />");
    expect(codeOf(PREVIEWS)).toContain("Verification required");
  });
});

describe("13.5D-2 static security guards", () => {
  it("review UI carries no identity channel, secrets, or server imports", () => {
    const sources = [...REVIEW_COMPONENTS, ...REVIEW_LIB].map(codeOf);
    for (const [i, code] of sources.entries()) {
      const file = [...REVIEW_COMPONENTS, ...REVIEW_LIB][i];
      const stripped = code
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\s)\/\/.*$/gm, "$1");
      for (const token of [
        "ADMIN_API_SECRET",
        "x-admin-key",
        "localStorage",
        "sessionStorage",
        "@/db",
        "drizzle-orm",
        "CmsService",
        "TranslationService",
        "DictionaryService",
        "verifyTranslation(",
        "service-role",
        "service_role",
        "dangerouslySetInnerHTML",
        "getSession(",
      ]) {
        expect(`${file}: ${token}`).toBe(`${file}: ${token}`);
        expect(stripped).not.toContain(token);
      }
    }
  });

  it("entity_translations appears only in the mandated verify sentence", () => {
    for (const file of [...REVIEW_COMPONENTS, ...REVIEW_LIB]) {
      const withoutSentence = codeOf(file).replace(
        "This will promote the approved translation into\n                  entity_translations.",
        ""
      );
      expect(withoutSentence).not.toContain("entity_translations");
    }
  });

  it("review pages are server-gated through the shared gate", () => {
    for (const page of [
      "src/app/admin/review/page.tsx",
      "src/app/admin/review/[id]/page.tsx",
    ]) {
      const code = codeOf(page);
      expect(code).toContain("getAdminCapabilities()");
      expect(code).toContain("<GateCard");
      expect(code).not.toContain("localStorage");
    }
  });
});
