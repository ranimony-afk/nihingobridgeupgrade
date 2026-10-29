import type { MindTreeMnemonicRecord } from "@/lib/kanji/mindtreeMnemonicContent";

export type MnemonicRevisionField = "keyword" | "story" | "componentCues" | "readingHook" | "sourceReferences" | "status" | "origin";
export interface MnemonicRevisionChange {
  field: MnemonicRevisionField;
  before: string;
  after: string;
}

function valueFor(record: MindTreeMnemonicRecord, field: MnemonicRevisionField): string {
  switch (field) {
    case "componentCues": return record.componentCues.join("\n");
    case "sourceReferences": return record.sourceReferences.join("\n");
    case "readingHook": return record.readingHook ?? "";
    case "status": return record.editorialStatus;
    case "origin": return record.origin;
    default: return record[field];
  }
}

export function compareMnemonicRevisions(
  previous: MindTreeMnemonicRecord | null,
  current: MindTreeMnemonicRecord,
): MnemonicRevisionChange[] {
  if (!previous) {
    return [{ field: "story", before: "<no saved revision>", after: current.story }];
  }
  const fields: MnemonicRevisionField[] = ["keyword", "story", "componentCues", "readingHook", "sourceReferences", "status", "origin"];
  return fields.flatMap((field) => {
    const before = valueFor(previous, field);
    const after = valueFor(current, field);
    return before === after ? [] : [{ field, before, after }];
  });
}

/** Version counters are local sequence numbers, not tamper-proof audit IDs. */
export function saveLocalMnemonicRevision(
  working: MindTreeMnemonicRecord,
  previous: MindTreeMnemonicRecord | null,
): MindTreeMnemonicRecord {
  return {
    ...working,
    version: previous ? Math.max(working.version, previous.version) + 1 : Math.max(1, working.version),
  };
}

export function cancelLocalMnemonicRevision(
  records: readonly MindTreeMnemonicRecord[],
  recordId: string,
  savedRevision: MindTreeMnemonicRecord | null,
): MindTreeMnemonicRecord[] {
  if (!savedRevision) return records.filter((record) => record.id !== recordId);
  const replaced = records.map((record) => record.id === recordId ? savedRevision : record);
  return replaced.some((record) => record.id === recordId) ? replaced : [...replaced, savedRevision];
}

export function sameMnemonicRevision(left: MindTreeMnemonicRecord | null, right: MindTreeMnemonicRecord | null): boolean {
  if (!left || !right) return left === right;
  return compareMnemonicRevisions(left, right).length === 0 && left.version === right.version
    && left.id === right.id && left.character === right.character && left.provenanceRef === right.provenanceRef;
}
