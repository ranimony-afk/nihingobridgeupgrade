/**
 * Shared question-generation helpers.
 *
 * `normalizeAnswer` is mirrored exactly by
 * `src/services/questions/engine.ts` so stored accepted answers and typed
 * learner input are always compared on identical terms.
 */

/** Katakana -> hiragana so a learner may answer in either script. */
const toHiragana = (value) =>
  String(value).replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  );

export function normalizeAnswer(value) {
  return toHiragana(String(value ?? "").normalize("NFKC"))
    .toLowerCase()
    .replace(/[\s.,。、・.-]/g, "")
    .trim();
}

/** Deterministic shuffle so regenerating the bank does not churn option order. */
export function stableShuffle(items, seed) {
  const scored = items.map((item, index) => {
    let hash = (seed * 31 + index * 17) >>> 0;
    const label = String(item?.label ?? item);
    for (let i = 0; i < label.length; i += 1) {
      hash = (hash * 33 + label.charCodeAt(i)) % 1000003;
    }
    return { item, hash };
  });
  scored.sort((a, b) => a.hash - b.hash);
  return scored.map((entry) => entry.item);
}

/** Picks plausible, non-duplicate distractors from a sibling pool. */
export function pickDistractors(pool, correct, count, seed) {
  const correctKey = normalizeAnswer(correct);
  const unique = new Map();
  for (const candidate of pool) {
    const label = candidate?.label ?? candidate;
    const key = normalizeAnswer(label);
    if (!key || key === correctKey || unique.has(key)) continue;
    unique.set(key, { label: String(label) });
  }
  return stableShuffle([...unique.values()], seed).slice(0, count);
}

/** Builds a shuffled option set with exactly one correct answer. */
export function buildOptions(correct, pool, seed, optionCount = 4) {
  const distractors = pickDistractors(pool, correct, optionCount - 1, seed);
  if (distractors.length < optionCount - 1) return null;
  return stableShuffle(
    [
      { label: String(correct), isCorrect: true },
      ...distractors.map((item) => ({ label: item.label, isCorrect: false })),
    ],
    seed,
  );
}
