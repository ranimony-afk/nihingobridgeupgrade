/**
 * Phase 13.5B — CMS admin UI tests.
 *
 * The repository has no DOM test harness (vitest runs in node), so UI
 * behavior is verified at the layers the repo supports: the pure action
 * visibility matrix components render from, the API error mapper, the
 * form validator, payload shaping, the `q` search path end to end, and
 * static guards proving client code carries no identity channel.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

import { visibleActions } from "@/lib/cms-admin/actions";
import type { CmsActionId } from "@/lib/cms-admin/actions";
import type { CmsPermission, CmsStatus } from "@/lib/cms-admin/types";
import {
  VERSION_CONFLICT_MESSAGE,
  cmsRequest,
  interpretApiResponse,
} from "@/lib/cms-admin/api";
import {
  EMPTY_DICTIONARY_FORM,
  buildStagedPayload,
  extractKanji,
  formatSensesText,
  formFromItem,
  parseSensesText,
  validateDictionaryForm,
} from "@/lib/cms-admin/payload";
import type { AdminCmsItem } from "@/lib/cms-admin/types";
import {
  resetActorResolver,
  setActorResolver,
} from "@/lib/auth";
import type { CmsRole } from "@/lib/auth";
import {
  resetCmsDatabaseOverride,
  setCmsDatabaseOverride,
} from "@/services/cms";
import { FakeCmsStore } from "./cms-fake-store";
import { GET as collectionGET } from "@/app/api/cms/dictionary/route";
import { POST as collectionPOST } from "@/app/api/cms/dictionary/route";

const EDITOR: readonly CmsPermission[] = [
  "cms.read",
  "cms.create",
  "cms.edit",
  "cms.submit_review",
];
const REVIEWER: readonly CmsPermission[] = [
  "cms.read",
  "cms.approve",
  "cms.verify_translation",
];
const ADMIN: readonly CmsPermission[] = [
  "cms.read",
  "cms.create",
  "cms.edit",
  "cms.submit_review",
  "cms.approve",
  "cms.schedule",
  "cms.publish",
  "cms.archive",
  "cms.rollback",
  "cms.verify_translation",
];
const LEARNER: readonly CmsPermission[] = [];

function shown(
  permissions: readonly CmsPermission[],
  isAdmin: boolean,
  status: CmsStatus,
  isAuthor = false
): CmsActionId[] {
  return visibleActions({ permissions, isAdmin, status, isAuthor });
}

describe("13.5B: action visibility matrix (server capabilities → buttons)", () => {
  it("editor sees editor actions on drafts, nothing elsewhere", () => {
    expect(shown(EDITOR, false, "draft")).toEqual(["save", "submit"]);
    expect(shown(EDITOR, false, "review")).toEqual([]);
    expect(shown(EDITOR, false, "approved")).toEqual([]);
    expect(shown(EDITOR, false, "published")).toEqual([]);
  });

  it("editor never sees approve/publish/schedule/rollback", () => {
    const statuses: CmsStatus[] = [
      "draft",
      "review",
      "approved",
      "scheduled",
      "published",
      "archived",
    ];
    for (const status of statuses) {
      const actions = shown(EDITOR, false, status);
      expect(actions).not.toContain("approve");
      expect(actions).not.toContain("publish");
      expect(actions).not.toContain("schedule");
      expect(actions).not.toContain("rollback");
      expect(actions).not.toContain("override");
    }
  });

  it("reviewer sees review actions, never publish or override", () => {
    expect(shown(REVIEWER, false, "review")).toEqual([
      "requestChanges",
      "approve",
    ]);
    expect(shown(REVIEWER, false, "draft")).toEqual([]);
    expect(shown(REVIEWER, false, "approved")).toEqual([]);
    const statuses: CmsStatus[] = [
      "draft",
      "review",
      "approved",
      "scheduled",
      "published",
      "archived",
    ];
    for (const status of statuses) {
      expect(shown(REVIEWER, false, status)).not.toContain("publish");
      expect(shown(REVIEWER, false, status)).not.toContain("override");
    }
  });

  it("authors never see Approve on their own items", () => {
    expect(shown(REVIEWER, false, "review", true)).toEqual(["requestChanges"]);
    expect(shown(ADMIN, true, "review", true)).toEqual([
      "requestChanges",
      "override",
      "rollback",
    ]);
  });

  it("admin sees the full lifecycle per status", () => {
    expect(shown(ADMIN, true, "draft")).toEqual(["save", "submit", "rollback"]);
    expect(shown(ADMIN, true, "review")).toEqual([
      "requestChanges",
      "approve",
      "override",
      "rollback",
    ]);
    expect(shown(ADMIN, true, "approved")).toEqual([
      "schedule",
      "publish",
      "rollback",
    ]);
    expect(shown(ADMIN, true, "scheduled")).toEqual(["publish", "rollback"]);
    expect(shown(ADMIN, true, "published")).toEqual(["archive", "rollback"]);
    expect(shown(ADMIN, true, "archived")).toEqual(["rollback"]);
  });

  it("learner sees no actions anywhere", () => {
    const statuses: CmsStatus[] = [
      "draft",
      "review",
      "approved",
      "scheduled",
      "published",
      "archived",
    ];
    for (const status of statuses) {
      expect(shown(LEARNER, false, status)).toEqual([]);
    }
  });
});

describe("13.5B: API error mapping (no stack traces, no leaks)", () => {
  it("401 → session-expired message", () => {
    const result = interpretApiResponse(401, {
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Authentication required." },
    });
    expect(result).toMatchObject({
      ok: false,
      failure: {
        kind: "unauthorized",
        message: "Session expired — please sign in again.",
      },
    });
  });

  it("403 → server's safe denial wording", () => {
    const result = interpretApiResponse(403, {
      success: false,
      error: {
        code: "SELF_APPROVAL_FORBIDDEN",
        message: "The author cannot approve their own content.",
      },
    });
    expect(result).toMatchObject({
      ok: false,
      failure: {
        kind: "forbidden",
        message: "The author cannot approve their own content.",
      },
    });
    const bare = interpretApiResponse(403, null);
    expect(bare).toMatchObject({
      ok: false,
      failure: { kind: "forbidden", message: "Permission denied." },
    });
  });

  it("409 → the exact mandated conflict message", () => {
    const result = interpretApiResponse(409, {
      success: false,
      error: { code: "VERSION_CONFLICT", message: "Version conflict: ..." },
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { kind: "conflict", message: VERSION_CONFLICT_MESSAGE },
    });
    expect(VERSION_CONFLICT_MESSAGE).toBe(
      "This content was changed by another user. Reload before saving."
    );
  });

  it("400 and 422 → validation with server field text", () => {
    for (const status of [400, 422]) {
      const result = interpretApiResponse(status, {
        success: false,
        error: { code: "VALIDATION_ERROR", message: "title is required." },
      });
      expect(result).toMatchObject({
        ok: false,
        failure: { kind: "validation", message: "title is required." },
      });
    }
  });

  it("500 and unknown shapes → generic message, internals never surface", () => {
    const result = interpretApiResponse(500, {
      success: false,
      error: { code: "X", message: "conn=postgres://secret stack at ..." },
    });
    expect(result).toMatchObject({
      ok: false,
      failure: { kind: "server", message: "Unexpected server error. Please try again." },
    });
    expect(JSON.stringify(result)).not.toContain("postgres://secret");
    const weird = interpretApiResponse(418, "<html>teapot</html>");
    expect(weird).toMatchObject({ ok: false, failure: { kind: "server" } });
  });

  it("cmsRequest maps network failure to a connection message", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("boom");
    }) as typeof fetch;
    try {
      const result = await cmsRequest("/api/cms/dictionary");
      expect(result).toMatchObject({
        ok: false,
        failure: { kind: "server", code: "NETWORK_ERROR" },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("cmsRequest parses the success envelope", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: true, data: { hello: 1 } }), {
        status: 200,
      })) as typeof fetch;
    try {
      const result = await cmsRequest<{ hello: number }>("/api/cms/dictionary");
      expect(result).toEqual({ ok: true, status: 200, data: { hello: 1 } });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("13.5B: form validation and payload shaping", () => {
  it("required fields are enforced", () => {
    const errors = validateDictionaryForm(EMPTY_DICTIONARY_FORM, {
      isCreate: false,
    });
    expect(errors.title).toBe("Title is required.");
    expect(errors.headword).toBe("Headword is required.");
    expect(errors.reading).toBe("Reading is required.");
    expect(errors.sensesText).toBe(
      "At least one sense with a gloss is required."
    );
  });

  it("creation requires sourceRef and a controlled provenance", () => {
    const base = {
      ...EMPTY_DICTIONARY_FORM,
      title: "water",
      headword: "水",
      reading: "みず",
      sensesText: "water",
    };
    expect(
      validateDictionaryForm(base, {
        isCreate: true,
        sourceRef: "",
        provenanceType: "wikipedia",
      })
    ).toMatchObject({
      sourceRef: "Source reference is required.",
      provenanceType: "Choose a provenance type.",
    });
    expect(
      validateDictionaryForm(base, {
        isCreate: true,
        sourceRef: "first-party:test:v1",
        provenanceType: "editorial_curated",
      })
    ).toEqual({});
  });

  it("senses text round-trips glosses and notes", () => {
    const parsed = parseSensesText("water // noun\ncold water; drinking water");
    expect(parsed).toEqual([
      { glosses: ["water"], note: "noun" },
      { glosses: ["cold water", "drinking water"] },
    ]);
    expect(formatSensesText(parsed)).toBe(
      "water // noun\ncold water; drinking water"
    );
    // Blank lines and gloss-less lines are dropped, never crash.
    expect(parseSensesText("\n  \n// just a note\nok")).toEqual([
      { glosses: ["ok"] },
    ]);
  });

  it("payload build derives kanji linkage and trims fields", () => {
    const payload = buildStagedPayload({
      ...EMPTY_DICTIONARY_FORM,
      headword: " 水 ",
      reading: "みず",
      partsOfSpeech: "noun, ",
      sensesText: "water",
      tags: "daily-life, beginner",
    });
    expect(payload).toMatchObject({
      headword: "水",
      partsOfSpeech: ["noun"],
      senses: [{ glosses: ["water"] }],
      kanjiCharacters: ["水"],
      tags: ["daily-life", "beginner"],
    });
    expect(extractKanji("あいうえお")).toEqual([]);
    expect(extractKanji("日本語")).toEqual(["日", "本", "語"]);
  });

  it("formFromItem tolerates foreign payload shapes", () => {
    const item = {
      title: "t",
      editorialNotes: null,
      stagedPayload: {
        headword: 42,
        senses: ["nope", { glosses: [] }, { glosses: ["water"], note: 7 }],
      },
    } as unknown as AdminCmsItem;
    const form = formFromItem(item);
    expect(form.headword).toBe("");
    expect(form.sensesText).toBe("water");
  });
});

describe("13.5B: API-backed search (q param)", () => {
  let store: FakeCmsStore;

  beforeEach(() => {
    resetActorResolver();
    resetCmsDatabaseOverride();
    store = new FakeCmsStore();
    setCmsDatabaseOverride(store);
  });

  afterEach(() => {
    resetActorResolver();
    resetCmsDatabaseOverride();
  });

  function actAs(role: CmsRole, id = `${role}-1`) {
    setActorResolver(() => ({ id, role }));
  }

  async function createAsEditor(title: string): Promise<string> {
    actAs("editor");
    const res = await collectionPOST(
      new Request("http://localhost/api/cms/dictionary", {
        method: "POST",
        body: JSON.stringify({
          title,
          stagedPayload: { headword: title, reading: "x" },
          sourceRef: "first-party:test:v1",
          provenanceType: "editorial_curated",
        }),
      })
    );
    const json = (await res.json()) as { data: { id: string } };
    return json.data.id;
  }

  it("q filters by title substring, case-insensitively", async () => {
    await createAsEditor("water");
    await createAsEditor("fire");
    actAs("editor");
    const res = await collectionGET(
      new Request("http://localhost/api/cms/dictionary?q=WAT")
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { items: { title: string }[] } };
    expect(json.data.items.map((i) => i.title)).toEqual(["water"]);
  });

  it("q composes with the status filter and rejects oversized input", async () => {
    await createAsEditor("water");
    actAs("editor");
    const filtered = await collectionGET(
      new Request("http://localhost/api/cms/dictionary?q=water&status=review")
    );
    expect(filtered.status).toBe(200);
    const json = (await filtered.json()) as { data: { items: unknown[] } };
    expect(json.data.items).toEqual([]);

    const tooLong = await collectionGET(
      new Request(
        `http://localhost/api/cms/dictionary?q=${"x".repeat(501)}`
      )
    );
    expect(tooLong.status).toBe(400);
  });
});

describe("13.5B: client static guards (no identity channel in UI code)", () => {
  const clientFiles = [
    "src/lib/cms-admin/types.ts",
    "src/lib/cms-admin/actions.ts",
    "src/lib/cms-admin/api.ts",
    "src/lib/cms-admin/payload.ts",
    "src/components/admin/StatusBadge.tsx",
    "src/components/admin/DictionaryList.tsx",
    "src/components/admin/DictionaryEditor.tsx",
    "src/app/admin/dictionary/page.tsx",
    "src/app/admin/dictionary/[id]/page.tsx",
  ];

  it("no storage-based identity, secret headers, or userId plumbing", () => {
    const forbidden =
      /localStorage|sessionStorage|x-user-id|x-admin-key|ADMIN_API_SECRET|getSession\(|userId/;
    for (const file of clientFiles) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|\s)\/\/.*$/gm, "$1");
      expect(`${file}: ${code}`).not.toMatch(forbidden);
    }
  });

  it("client modules import no server-only runtime (type-only is fine)", () => {
    const runtimeServerImport =
      /import\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?["'](?:@\/lib\/auth|@\/services\/cms|@\/db)["']|from\s+["']server-only["']/;
    const clientOnly = clientFiles.filter(
      (f) =>
        f.startsWith("src/components/") ||
        (f.startsWith("src/lib/cms-admin/") && !f.endsWith("/server.ts"))
    );
    for (const file of clientOnly) {
      expect(`${file}: ${readFileSync(file, "utf8")}`).not.toMatch(
        runtimeServerImport
      );
    }
  });
});
