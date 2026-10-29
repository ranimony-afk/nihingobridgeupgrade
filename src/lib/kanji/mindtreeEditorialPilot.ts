export type MindTreePilotCaseKind =
  | "first_party_draft"
  | "ai_candidate"
  | "ai_revised_carry_forward"
  | "provenance_gap"
  | "missing_mnemonic";

export interface MindTreeEditorialPilotCase {
  kind: MindTreePilotCaseKind;
  character: string;
  recordId: string | null;
  selectionRationale: string;
}

/** Explicit M6 review-readiness sample; every identity was checked in M4 data. */
export const MINDTREE_M6_PILOT_CASES: readonly MindTreeEditorialPilotCase[] = [
  {
    kind: "first_party_draft",
    character: "明",
    recordId: "first-party-660e",
    selectionRationale: "Existing first-party draft with a generic source pointer; tests original seed-origin handling without treating authorship as reviewed.",
  },
  {
    kind: "provenance_gap",
    character: "休",
    recordId: "first-party-4f11",
    selectionRationale: "First-party draft whose only sourceReferences item repeats the generic seed provenanceRef; attribution/version detail is insufficient for release readiness.",
  },
  {
    kind: "ai_candidate",
    character: "一",
    recordId: "m4-ai-4e00",
    selectionRationale: "Existing AI-generated candidate overlay record; source references identify context, not the story wording.",
  },
  {
    kind: "ai_revised_carry_forward",
    character: "男",
    recordId: "m4-ai-otoko",
    selectionRationale: "M4 report/source identifies this as M2 AI-revised text moved to the candidate overlay; no original human revision chain or approval evidence is present.",
  },
  {
    kind: "missing_mnemonic",
    character: "人",
    recordId: null,
    selectionRationale: "Supported by the fixed source slice but has no mnemonic record; preserve the missing-coverage state rather than fabricate a review subject.",
  },
] as const;
