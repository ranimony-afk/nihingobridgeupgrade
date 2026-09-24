/**
 * §20 — Provenance quality check tests.
 *
 * DB-independent pure functions. The registry is constructed in-test rather than
 * loaded, so these tests assert the *rules*, not the current contents of the real
 * registry.
 */

import { describe, it, expect } from "vitest";

import type { QualityFinding } from "@/services/dataquality/checks";
import {
  checkSourceRegistration,
  checkStatusProvenanceConsistency,
  checkRegistryCompleteness,
  checkArtifactIdentity,
  checkSnapshotId,
  checkSupersessionRetention,
  SNAPSHOT_ID_REGEX,
  VERIFIED_STATUSES,
  type RegisteredSource,
} from "@/services/dataquality/provenanceChecks";

const codes = (findings: QualityFinding[]) => findings.map((f) => f.code);

const source = (over: Partial<RegisteredSource> & { id: string }): RegisteredSource => ({
  type: "first-party",
  name: "Test Source",
  version: "v1",
  releaseDate: "2024-01-01",
  license: "CC-BY-SA-3.0",
  attribution: "Test Author",
  ...over,
});

const registryOf = (...sources: RegisteredSource[]) =>
  new Map(sources.map((s) => [s.id, s]));

const REAL_REGISTRY = registryOf(
  source({ id: "first-party:kanji-mindtree:v1", version: "v1" }),
  source({ id: "first-party:grammar-core:v1", version: "v1" }),
  source({
    id: "upstream:jmdict:2023-08",
    type: "upstream",
    version: "2023-08",
    releaseDate: "2023-08-20",
  })
);

/* ================================================================== */

describe("§20 source registration", () => {
  it("accepts a reference that resolves", () => {
    expect(
      checkSourceRegistration(
        "dictionary_entries",
        [{ id: "de-1", sourceRef: "upstream:jmdict:2023-08" }],
        REAL_REGISTRY
      )
    ).toEqual([]);
  });

  it("flags a well-formed reference that resolves to nothing", () => {
    const findings = checkSourceRegistration(
      "keigo_relations",
      [{ id: "k-1", sourceRef: "first-party:keigo-architecture:v1" }],
      REAL_REGISTRY
    );
    expect(codes(findings)).toEqual(["UNREGISTERED_SOURCE"]);
    expect(findings[0]!.severity).toBe("ERROR");
    expect(findings[0]!.detail).toContain("not present in the provenance registry");
  });

  it("does not double-report absent or placeholder references", () => {
    // Those are checkProvenanceRef's findings; reporting them here too would
    // count one defect twice.
    expect(
      checkSourceRegistration(
        "t",
        [
          { id: "a", sourceRef: null },
          { id: "b", sourceRef: "" },
          { id: "c", sourceRef: "latest" },
          { id: "d", sourceRef: "UNKNOWN" },
        ],
        REAL_REGISTRY
      )
    ).toEqual([]);
  });

  it("scales to many records without collapsing findings", () => {
    const records = Array.from({ length: 100 }, (_, i) => ({
      id: `r-${i}`,
      sourceRef: "first-party:nope:v1",
    }));
    expect(checkSourceRegistration("t", records, REAL_REGISTRY)).toHaveLength(100);
  });
});

describe("§20 verified status must be earned", () => {
  it("accepts published content with a resolving source", () => {
    expect(
      checkStatusProvenanceConsistency(
        "keigo_relations",
        [
          {
            id: "k-1",
            sourceRef: "first-party:kanji-mindtree:v1",
            verificationStatus: "published",
          },
        ],
        REAL_REGISTRY
      )
    ).toEqual([]);
  });

  it("flags published content citing an unregistered source", () => {
    const findings = checkStatusProvenanceConsistency(
      "keigo_relations",
      [
        {
          id: "k-1",
          sourceRef: "first-party:keigo-architecture:v1",
          verificationStatus: "published",
        },
      ],
      REAL_REGISTRY
    );
    expect(codes(findings)).toEqual(["VERIFIED_WITH_UNREGISTERED_SOURCE"]);
  });

  it("flags verified content with no source at all", () => {
    const findings = checkStatusProvenanceConsistency(
      "t",
      [{ id: "a", sourceRef: null, verificationStatus: "verified" }],
      REAL_REGISTRY
    );
    expect(codes(findings)).toEqual(["VERIFIED_WITHOUT_PROVENANCE"]);
  });

  it("flags verified content citing a placeholder", () => {
    const findings = checkStatusProvenanceConsistency(
      "t",
      [{ id: "a", sourceRef: "manual", verificationStatus: "published" }],
      REAL_REGISTRY
    );
    expect(codes(findings)).toEqual(["VERIFIED_WITH_PLACEHOLDER_PROVENANCE"]);
  });

  it("does not constrain unverified statuses", () => {
    expect(
      checkStatusProvenanceConsistency(
        "t",
        [
          { id: "a", sourceRef: null, verificationStatus: "requires_review" },
          { id: "b", sourceRef: "latest", verificationStatus: "draft" },
          { id: "c", sourceRef: "nope", verificationStatus: "unverified" },
        ],
        REAL_REGISTRY
      )
    ).toEqual([]);
  });

  it("treats published and verified as the two verified statuses", () => {
    expect([...VERIFIED_STATUSES]).toEqual(["published", "verified"]);
  });

  it("is case-insensitive about the status but not the reference", () => {
    // Status matching is normalised; the source id is compared verbatim.
    expect(
      checkStatusProvenanceConsistency(
        "t",
        [
          {
            id: "a",
            sourceRef: "first-party:kanji-mindtree:v1",
            verificationStatus: "PUBLISHED",
          },
        ],
        REAL_REGISTRY
      )
    ).toEqual([]);

    expect(
      codes(
        checkStatusProvenanceConsistency(
          "t",
          [
            {
              id: "b",
              sourceRef: "First-Party:Kanji-Mindtree:v1",
              verificationStatus: "published",
            },
          ],
          REAL_REGISTRY
        )
      )
    ).toEqual(["VERIFIED_WITH_UNREGISTERED_SOURCE"]);
  });
});

describe("§20 registry completeness", () => {
  it("accepts a complete entry", () => {
    expect(checkRegistryCompleteness([source({ id: "first-party:x:v1" })])).toEqual([]);
  });

  it("requires licence and attribution as errors", () => {
    const findings = checkRegistryCompleteness([
      source({ id: "s-1", license: "", attribution: "   " }),
    ]);
    expect(codes(findings).sort()).toEqual([
      "SOURCE_MISSING_ATTRIBUTION",
      "SOURCE_MISSING_LICENSE",
    ]);
    expect(findings.every((f) => f.severity === "ERROR")).toBe(true);
  });

  it("rejects a placeholder version but treats a missing date as a warning", () => {
    const findings = checkRegistryCompleteness([
      source({ id: "s-1", version: "latest", releaseDate: "" }),
    ]);
    expect(codes(findings).sort()).toEqual([
      "SOURCE_MISSING_RELEASE_DATE",
      "SOURCE_PLACEHOLDER_VERSION",
    ]);
    const byCode = Object.fromEntries(findings.map((f) => [f.code, f.severity]));
    expect(byCode.SOURCE_PLACEHOLDER_VERSION).toBe("ERROR");
    expect(byCode.SOURCE_MISSING_RELEASE_DATE).toBe("WARNING");
  });

  it("rejects a missing version outright", () => {
    const findings = checkRegistryCompleteness([source({ id: "s-1", version: "" })]);
    expect(codes(findings)).toEqual(["SOURCE_MISSING_VERSION"]);
  });
});

describe("§20 artifact identity", () => {
  const good = {
    sourceId: "upstream:tatoeba:snapshot-2024-07-01-abcdef12",
    filename: "sentences.tar.bz2",
    bytes: 123_456_789,
    sha256: "a".repeat(64),
    acquiredAt: "2024-07-05T10:00:00Z",
    acquiredWith: "curl/8.5.0",
    extractedSha256: "b".repeat(64),
  };

  it("accepts a complete identity with both digests", () => {
    expect(checkArtifactIdentity("artifacts", [good])).toEqual([]);
  });

  it("warns when a compressed artifact lacks an extracted digest", () => {
    const { extractedSha256: _omit, ...rest } = good;
    const findings = checkArtifactIdentity("artifacts", [rest]);
    expect(codes(findings)).toEqual(["ARTIFACT_MISSING_EXTRACTED_SHA256"]);
    expect(findings[0]!.severity).toBe("WARNING");
  });

  it("does not warn about a missing extracted digest for an uncompressed artifact", () => {
    const { extractedSha256: _omit, ...rest } = good;
    expect(checkArtifactIdentity("artifacts", [{ ...rest, filename: "kanjidic2.xml" }])).toEqual([]);
  });

  it("rejects a malformed digest as worse than none", () => {
    const findings = checkArtifactIdentity("artifacts", [
      { ...good, sha256: "not-a-digest" },
      { ...good, extractedSha256: "ABC" },
    ]);
    expect(codes(findings)).toEqual(["ARTIFACT_SHA256_MALFORMED", "ARTIFACT_SHA256_MALFORMED"]);
  });

  it("requires uppercase-free 64-character digests", () => {
    expect(
      codes(checkArtifactIdentity("artifacts", [{ ...good, sha256: "A".repeat(64) }]))
    ).toEqual(["ARTIFACT_SHA256_MALFORMED"]);
    expect(
      codes(checkArtifactIdentity("artifacts", [{ ...good, sha256: "a".repeat(63) }]))
    ).toEqual(["ARTIFACT_SHA256_MALFORMED"]);
  });

  it("rejects non-positive or non-finite byte sizes", () => {
    const findings = checkArtifactIdentity("artifacts", [
      { ...good, bytes: 0 },
      { ...good, bytes: -1 },
      { ...good, bytes: Number.NaN },
    ]);
    expect(findings).toHaveLength(3);
    expect(findings.every((f) => f.code === "ARTIFACT_BYTES_INVALID")).toBe(true);
  });

  it("requires acquisition tooling to be recorded", () => {
    const findings = checkArtifactIdentity("artifacts", [{ ...good, acquiredWith: "" }]);
    expect(codes(findings)).toEqual(["ARTIFACT_MISSING_FIELD"]);
    expect(findings[0]!.detail).toContain("acquiredWith");
  });

  it("reports every missing required field", () => {
    const findings = checkArtifactIdentity("artifacts", [
      {
        sourceId: "",
        filename: "",
        bytes: 100,
        sha256: "",
        acquiredAt: "",
        acquiredWith: "",
      },
    ]);
    expect(findings.filter((f) => f.code === "ARTIFACT_MISSING_FIELD")).toHaveLength(5);
  });
});

describe("§20 snapshot identity", () => {
  it("accepts the project convention", () => {
    expect(
      SNAPSHOT_ID_REGEX.test("upstream:tatoeba:snapshot-2024-07-01-1f5308f2")
    ).toBe(true);
    expect(
      codes(
        checkSnapshotId("sources", [
          { id: "s-1", sourceId: "upstream:tatoeba:snapshot-2024-07-01-1f5308f2" },
        ])
      )
    ).toEqual([]);
  });

  it("rejects identifiers that do not carry a date and digest", () => {
    const bad = [
      "upstream:tatoeba:2024-07",
      "upstream:tatoeba:snapshot-2024-07",
      "upstream:tatoeba:snapshot-2024-07-01",
      "tatoeba:snapshot-2024-07-01-abcdef12",
      "upstream:tatoeba:snapshot-2024-07-01-ZZZZZZZZ",
    ];
    const findings = checkSnapshotId(
      "sources",
      bad.map((sourceId, i) => ({ id: `s-${i}`, sourceId }))
    );
    expect(findings).toHaveLength(bad.length);
    expect(findings.every((f) => f.code === "SNAPSHOT_ID_MALFORMED")).toBe(true);
  });

  it("accepts a full-length sha256 suffix", () => {
    expect(
      SNAPSHOT_ID_REGEX.test(`upstream:tatoeba:snapshot-2024-07-01-${"a".repeat(64)}`)
    ).toBe(true);
  });
});

describe("§20 supersession retention", () => {
  it("stays silent when only one snapshot exists for a provider", () => {
    expect(
      checkSupersessionRetention("upstream:tatoeba:snapshot-2026-01-01-aaaaaaaa", REAL_REGISTRY)
    ).toEqual([]);
  });

  it("warns when a retained superseded entry cannot be dated", () => {
    const registry = registryOf(
      source({
        id: "upstream:tatoeba:snapshot-2026-01-01-aaaaaaaa",
        type: "upstream",
        version: "2026-01",
        releaseDate: "2026-01-01",
      }),
      source({
        id: "upstream:tatoeba:2024-07",
        type: "upstream",
        version: "",
        releaseDate: "",
        status: "superseded",
      })
    );
    const findings = checkSupersessionRetention(
      "upstream:tatoeba:snapshot-2026-01-01-aaaaaaaa",
      registry
    );
    expect(codes(findings)).toEqual(["SUPERSEDED_SOURCE_INCOMPLETE"]);
    expect(findings[0]!.severity).toBe("WARNING");
    expect(findings[0]!.ref).toBe("upstream:tatoeba:2024-07");
  });

  it("does not report a fully-dated superseded entry", () => {
    const registry = registryOf(
      source({
        id: "upstream:tatoeba:snapshot-2026-01-01-aaaaaaaa",
        type: "upstream",
        version: "2026-01",
        releaseDate: "2026-01-01",
      }),
      source({
        id: "upstream:tatoeba:2024-07",
        type: "upstream",
        version: "2024-07",
        releaseDate: "2024-07-01",
        status: "superseded",
      })
    );
    expect(
      checkSupersessionRetention("upstream:tatoeba:snapshot-2026-01-01-aaaaaaaa", registry)
    ).toEqual([]);
  });

  it("does not confuse providers that share a namespace prefix", () => {
    const registry = registryOf(
      source({
        id: "upstream:jmdict:snapshot-2026-01-01-aaaaaaaa",
        type: "upstream",
        version: "2026-01",
        releaseDate: "2026-01-01",
      }),
      source({
        id: "upstream:tatoeba:2024-07",
        type: "upstream",
        version: "2024-07",
        releaseDate: "2024-07-01",
        status: "superseded",
      })
    );
    expect(
      checkSupersessionRetention("upstream:jmdict:snapshot-2026-01-01-aaaaaaaa", registry)
    ).toEqual([]);
  });

  it("stays silent when the current source is not in the registry", () => {
    expect(
      checkSupersessionRetention("upstream:absent:snapshot-2026-01-01-aaaaaaaa", REAL_REGISTRY)
    ).toEqual([]);
  });
});
