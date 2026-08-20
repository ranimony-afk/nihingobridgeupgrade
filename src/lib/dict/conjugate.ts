export type Conjugation = { form: string; surface: string; reading: string };

function ichidan(stem: string, readingStem: string): Conjugation[] {
  return [
    { form: "dictionary", surface: `${stem}る`, reading: `${readingStem}る` },
    { form: "masu", surface: `${stem}ます`, reading: `${readingStem}ます` },
    { form: "nai", surface: `${stem}ない`, reading: `${readingStem}ない` },
    { form: "ta", surface: `${stem}た`, reading: `${readingStem}た` },
    { form: "te", surface: `${stem}て`, reading: `${readingStem}て` },
    { form: "volitional", surface: `${stem}よう`, reading: `${readingStem}よう` },
    { form: "potential", surface: `${stem}られる`, reading: `${readingStem}られる` },
    { form: "passive", surface: `${stem}られる`, reading: `${readingStem}られる` },
    { form: "causative", surface: `${stem}させる`, reading: `${readingStem}させる` },
    { form: "imperative", surface: `${stem}ろ`, reading: `${readingStem}ろ` },
  ];
}

const GODAN: Record<string, { a: string; i: string; e: string; o: string; te: string; ta: string }> = {
  う: { a: "わ", i: "い", e: "え", o: "お", te: "って", ta: "った" },
  く: { a: "か", i: "き", e: "け", o: "こ", te: "いて", ta: "いた" },
  ぐ: { a: "が", i: "ぎ", e: "げ", o: "ご", te: "いで", ta: "いだ" },
  す: { a: "さ", i: "し", e: "せ", o: "そ", te: "して", ta: "した" },
  つ: { a: "た", i: "ち", e: "て", o: "と", te: "って", ta: "った" },
  ぬ: { a: "な", i: "に", e: "ね", o: "の", te: "んで", ta: "んだ" },
  ぶ: { a: "ば", i: "び", e: "べ", o: "ぼ", te: "んで", ta: "んだ" },
  む: { a: "ま", i: "み", e: "め", o: "も", te: "んで", ta: "んだ" },
  る: { a: "ら", i: "り", e: "れ", o: "ろ", te: "って", ta: "った" },
};

function godan(lemma: string, reading: string): Conjugation[] {
  const ending = lemma.slice(-1);
  const map = GODAN[ending];
  if (!map) return [];
  const stem = lemma.slice(0, -1);
  const rstem = reading.slice(0, -1);
  return [
    { form: "dictionary", surface: lemma, reading },
    { form: "masu", surface: `${stem}${map.i}ます`, reading: `${rstem}${map.i}ます` },
    { form: "nai", surface: `${stem}${map.a}ない`, reading: `${rstem}${map.a}ない` },
    { form: "ta", surface: `${stem}${map.ta}`, reading: `${rstem}${map.ta}` },
    { form: "te", surface: `${stem}${map.te}`, reading: `${rstem}${map.te}` },
    { form: "volitional", surface: `${stem}${map.o}う`, reading: `${rstem}${map.o}う` },
    { form: "potential", surface: `${stem}${map.e}る`, reading: `${rstem}${map.e}る` },
    { form: "imperative", surface: `${stem}${map.e}`, reading: `${rstem}${map.e}` },
  ];
}

function iAdj(lemma: string, reading: string): Conjugation[] {
  const stem = lemma.slice(0, -1);
  const rstem = reading.slice(0, -1);
  return [
    { form: "dictionary", surface: lemma, reading },
    { form: "nai", surface: `${stem}くない`, reading: `${rstem}くない` },
    { form: "ta", surface: `${stem}かった`, reading: `${rstem}かった` },
    { form: "te", surface: `${stem}くて`, reading: `${rstem}くて` },
    { form: "adverb", surface: `${stem}く`, reading: `${rstem}く` },
  ];
}

export function conjugate(lemma: string, reading: string, pos: string): Conjugation[] {
  if (pos === "adj" && lemma.endsWith("い")) return iAdj(lemma, reading);
  if (pos !== "verb") return [];
  if (lemma === "する") {
    return [
      { form: "dictionary", surface: "する", reading: "する" },
      { form: "masu", surface: "します", reading: "します" },
      { form: "nai", surface: "しない", reading: "しない" },
      { form: "ta", surface: "した", reading: "した" },
      { form: "te", surface: "して", reading: "して" },
    ];
  }
  if (lemma === "来る" || lemma === "くる") {
    return [
      { form: "dictionary", surface: "来る", reading: "くる" },
      { form: "masu", surface: "来ます", reading: "きます" },
      { form: "nai", surface: "来ない", reading: "こない" },
      { form: "ta", surface: "来た", reading: "きた" },
      { form: "te", surface: "来て", reading: "きて" },
    ];
  }
  if (lemma.endsWith("べる") || lemma.endsWith("みる") || lemma.endsWith("る") && reading.endsWith("べる")) {
    return ichidan(lemma.slice(0, -1), reading.slice(0, -1));
  }
  if (["食べる", "見る"].includes(lemma)) return ichidan(lemma.slice(0, -1), reading.slice(0, -1));
  return godan(lemma, reading);
}
