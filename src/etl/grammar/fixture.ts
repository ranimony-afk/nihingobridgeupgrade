import type { GrammarPatternInput } from "./types";

/**
 * Fixture covering all 5 JLPT levels: N5, N4, N3, N2, N1.
 * Canonical teaching patterns with structures, explanations, formations,
 * structured common mistakes, and descriptive tags.
 */
export const GRAMMAR_MULTI_LEVEL_FIXTURE: GrammarPatternInput[] = [
  // N5
  {
    slug: "desu",
    title: "〜です",
    structure: "Noun / Na-adjective + です",
    meaning: "to be (polite copula)",
    explanation:
      "Polite copula expressing an assertion or state of being. Equivalent to 'is', 'am', or 'are'.",
    formation: "Attached directly to nouns and na-adjectives.",
    jlptLevel: "N5",
    commonMistakes: [
      "Attaching です directly to i-adjectives in past tense without proper conjugation (e.g., 高いでした instead of 高かったです).",
      "Using です with verbs instead of ます.",
    ],
    tags: ["copula", "polite", "basic"],
  },
  // N4
  {
    slug: "sou-da-conjecture",
    title: "〜そうだ (looks like / looks as if)",
    structure: "Verb stem / I-adj stem / Na-adj stem + そうだ",
    meaning: "looks like; appears to be",
    explanation:
      "Expresses visual conjecture or impression based on direct observation.",
    formation: "Verb ます-stem + そうだ; い-adjective (drop い) + そうだ; な-adjective (drop な) + そうだ. Exception: よい → よさそうだ.",
    jlptLevel: "N4",
    commonMistakes: [
      "Confusing visual conjecture そうだ with hearsay そうだ (hearsay attaches to plain dictionary form).",
      "Using with nouns (use のようだ or らしい instead).",
    ],
    tags: ["conjecture", "appearance", "adjective"],
  },
  // N3
  {
    slug: "wake-ni-wa-ikanai",
    title: "〜わけにはいかない",
    structure: "Verb dictionary form + わけにはいかない",
    meaning: "cannot afford to; cannot possibly do due to social/moral reasons",
    explanation:
      "Indicates that one cannot do something because of psychological, social, moral, or situational constraints, even if physically capable.",
    formation: "Plain non-past verb + わけにはいかない.",
    jlptLevel: "N3",
    commonMistakes: [
      "Confusing with physical inability (potential verb form).",
      "Confusing with 〜ないわけにはいかない (which means 'must do / cannot avoid doing').",
    ],
    tags: ["obligation", "social-constraint", "modality"],
  },
  // N2
  {
    slug: "ni-kakawawarazu",
    title: "〜にかかわらず",
    structure: "Noun / Verb dictionary form + にかかわらず",
    meaning: "regardless of; whether or not",
    explanation:
      "States that an action or consequence is not influenced or affected by the stated condition.",
    formation: "Noun + にかかわらず; Verb plain affirmative + か + plain negative + か + にかかわらず.",
    jlptLevel: "N2",
    commonMistakes: [
      "Confusing with 〜にもかかわらず (which means 'in spite of / although', expressing contrast with an existing fact).",
      "Using it with subjective emotional states rather than objective criteria.",
    ],
    tags: ["condition", "formal", "written"],
  },
  // N1
  {
    slug: "o-kawa-kiri-ni",
    title: "〜を皮切りに",
    structure: "Noun + を皮切りに（して／として）",
    meaning: "starting with; kicked off by",
    explanation:
      "Indicates that a particular event serves as the starting point for a sequence of similar events spreading or developing rapidly.",
    formation: "Noun + を皮切りにして / を皮切りとして.",
    jlptLevel: "N1",
    commonMistakes: [
      "Using for natural disasters or spontaneous natural phenomena; usually reserved for human endeavors, tours, campaigns, or series of projects.",
      "Using when only a single event occurs without a following chain of actions.",
    ],
    tags: ["sequence", "formal", "advanced", "literary"],
  },
];
