/**
 * Conservative Japanese verb conjugation derived from JMdict POS tags.
 *
 * We only retain forms when the source POS identifies exactly one supported
 * conjugation class and the surface/reading terminal kana align. Unsupported
 * irregular or ambiguous entries are skipped rather than guessed.
 */

export type ConjugationForm = {
  form: "negative" | "polite" | "past" | "te";
  text: string;
  reading: string;
};

export type ConjugationResult =
  | { ok: true; class: "ichidan" | "godan" | "suru"; forms: ConjugationForm[] }
  | { ok: false; reason: string };

type Endings = { plain: string; negative: string; polite: string; past: string; te: string };

const GODAN_ENDINGS: Record<string, Endings> = {
  "う": { plain: "う", negative: "わない", polite: "います", past: "った", te: "って" },
  "く": { plain: "く", negative: "かない", polite: "きます", past: "いた", te: "いて" },
  "ぐ": { plain: "ぐ", negative: "がない", polite: "ぎます", past: "いだ", te: "いで" },
  "す": { plain: "す", negative: "さない", polite: "します", past: "した", te: "して" },
  "つ": { plain: "つ", negative: "たない", polite: "ちます", past: "った", te: "って" },
  "ぬ": { plain: "ぬ", negative: "なない", polite: "にます", past: "んだ", te: "んで" },
  "ぶ": { plain: "ぶ", negative: "ばない", polite: "びます", past: "んだ", te: "んで" },
  "む": { plain: "む", negative: "まない", polite: "みます", past: "んだ", te: "んで" },
  "る": { plain: "る", negative: "らない", polite: "ります", past: "った", te: "って" },
};

function terminalReplace(value: string, terminal: string, replacement: string): string | null {
  return value.endsWith(terminal) ? value.slice(0, -terminal.length) + replacement : null;
}

function makeForms(
  surface: string,
  reading: string,
  endings: Endings,
): ConjugationForm[] | null {
  const pairs: ConjugationForm[] = [];
  const specs: { form: ConjugationForm["form"]; ending: string }[] = [
    { form: "negative", ending: endings.negative },
    { form: "polite", ending: endings.polite },
    { form: "past", ending: endings.past },
    { form: "te", ending: endings.te },
  ];

  for (const spec of specs) {
    const text = terminalReplace(surface, endings.plain, spec.ending);
    const formReading = terminalReplace(reading, endings.plain, spec.ending);
    if (text === null || formReading === null) return null;
    pairs.push({ form: spec.form, text, reading: formReading });
  }
  return pairs;
}

/** Normalise only the POS classes we know can be handled correctly. */
function supportedClasses(posTags: string[]): string[] {
  const classes = new Set<string>();
  for (const tag of posTags) {
    if (tag === "v1") classes.add("ichidan");
    if (tag === "vs") classes.add("suru");
    if (/^v5(?:u|k|k-s|g|s|t|n|b|m|r|r-i|aru)$/.test(tag)) classes.add("godan");
  }
  return [...classes];
}

export function deriveConjugations(
  headword: string,
  reading: string,
  posTags: string[],
): ConjugationResult {
  const classes = supportedClasses(posTags);
  if (classes.length === 0) {
    return { ok: false, reason: "no supported JMdict verb POS tag" };
  }
  if (classes.length > 1) {
    return { ok: false, reason: `ambiguous verb classes: ${classes.join(", ")}` };
  }

  const verbClass = classes[0];

  if (verbClass === "ichidan") {
    const forms = makeForms(headword, reading, {
      plain: "る",
      negative: "ない",
      polite: "ます",
      past: "た",
      te: "て",
    });
    return forms
      ? { ok: true, class: "ichidan", forms }
      : { ok: false, reason: "ichidan surface/reading do not end in る" };
  }

  if (verbClass === "suru") {
    const forms = makeForms(headword, reading, {
      plain: "する",
      negative: "しない",
      polite: "します",
      past: "した",
      te: "して",
    });
    return forms
      ? { ok: true, class: "suru", forms }
      : { ok: false, reason: "suru surface/reading do not end in する" };
  }

  // KANJIDIC/JMdict use v5k-s for the 行く / ゆく exception.
  const isIkuException = posTags.includes("v5k-s");
  const finalKana = reading.at(-1) ?? "";
  const endings = GODAN_ENDINGS[finalKana];
  if (!endings) {
    return { ok: false, reason: `unsupported godan terminal: ${finalKana || "(empty)"}` };
  }

  const forms = makeForms(
    headword,
    reading,
    isIkuException
      ? { ...endings, past: "った", te: "って" }
      : endings,
  );
  return forms
    ? { ok: true, class: "godan", forms }
    : { ok: false, reason: `surface/reading do not share terminal ${finalKana}` };
}
