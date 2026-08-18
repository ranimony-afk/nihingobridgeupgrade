export type ValidationIssue = { code: string; message: string; path?: string };

const KANA = /[\u3040-\u30ff]/;
const KANJI = /[\u4e00-\u9fff]/;

export function validateLexeme(input: { lemma: string; reading: string; glosses: string[] }) {
  const issues: ValidationIssue[] = [];
  if (!input.lemma.trim()) issues.push({ code: "lemma.required", message: "Lemma required" });
  if (!input.reading.trim() || !KANA.test(input.reading)) {
    issues.push({ code: "reading.kana", message: "Reading must include kana", path: input.lemma });
  }
  if (!input.glosses.length) issues.push({ code: "gloss.required", message: "At least one gloss", path: input.lemma });
  return issues;
}

export function validateKanji(input: { character: string; strokes: number }) {
  const issues: ValidationIssue[] = [];
  if ([...input.character].length !== 1 || !KANJI.test(input.character)) {
    issues.push({ code: "kanji.char", message: "Single CJK character required" });
  }
  if (input.strokes < 1 || input.strokes > 40) {
    issues.push({ code: "kanji.strokes", message: "Stroke count out of range" });
  }
  return issues;
}

export function checksum(parts: string[]) {
  let hash = 0;
  const joined = parts.join("|");
  for (let index = 0; index < joined.length; index += 1) {
    hash = (hash * 33 + joined.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16);
}
