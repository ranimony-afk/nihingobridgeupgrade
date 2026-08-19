import type { GrammarSeed } from "./corpus";

function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[!.?,，。！？'"`~]/g, "")
    .replace(/\s+/g, " ");
}

export const GRAMMAR_CAPACITY = 10_000;

export function timelineFor(seed: GrammarSeed) {
  return [
    { step: "Recognise", note: `Spot ${seed.title} in reading.` },
    { step: "Form", note: seed.formation },
    { step: "Use", note: seed.nuance },
    { step: "Produce", note: `Build a sentence with ${seed.structure}.` },
  ];
}

export function aiExplanation(seed: GrammarSeed) {
  return `${seed.title} (${seed.level}, difficulty ${seed.difficulty}/9). ${seed.explanation} Formation: ${seed.formation} Watch out: ${seed.nuance}`;
}

export function checkBuilder(answer: string, attempt: string[] | string) {
  const joined = Array.isArray(attempt) ? attempt.join("") : attempt;
  return normalizeAnswer(joined.replace(/\s/g, "")) === normalizeAnswer(answer.replace(/\s/g, ""));
}
