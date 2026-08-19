export type Correction = { wrong: string; right: string; why: string };

const RULES: Correction[] = [
  { wrong: "食べるたい", right: "食べたい", why: "たい attaches to the verb stem, not the dictionary form." },
  { wrong: "見るたい", right: "見たい", why: "Use the stem before たい." },
  { wrong: "ですです", right: "です", why: "Only one copula per clause." },
  { wrong: "私わ", right: "私は", why: "The topic particle is written は." },
  { wrong: "を行きます", right: "に行きます", why: "Destination takes に or へ, not を." },
  { wrong: "たべれる", right: "食べられる", why: "ら-抜き form; keep られる in formal Japanese." },
];

export function detectCorrections(text: string) {
  const found: Correction[] = [];
  for (const rule of RULES) {
    if (text.includes(rule.wrong)) found.push(rule);
  }
  if (/[ぁ-んァ-ヶ一-龠]$/.test(text.trim()) && !text.includes("。") && text.length > 12) {
    found.push({ wrong: text.slice(-6), right: `${text.slice(-6)}。`, why: "Close the sentence with 。" });
  }
  return found;
}

export function detectGrammar(text: string, patterns: { id: string; title: string }[]) {
  return patterns.filter((pattern) => pattern.title && text.includes(pattern.title)).slice(0, 8);
}

export function detectVocabulary(text: string, lemmas: { id: string; lemma: string; reading: string }[]) {
  return lemmas.filter((row) => text.includes(row.lemma) || text.includes(row.reading)).slice(0, 12);
}

export function scoreTurn(text: string, corrections: Correction[], matchedVocab: number) {
  const kana = (text.match(/[ぁ-んァ-ヶ]/g) ?? []).length;
  const kanji = (text.match(/[一-龠]/g) ?? []).length;
  const japanese = kana + kanji;
  const lengthScore = Math.min(40, Math.round((japanese / 12) * 40));
  const vocabScore = Math.min(30, matchedVocab * 8);
  const accuracy = Math.max(0, 30 - corrections.length * 10);
  return Math.max(0, Math.min(100, lengthScore + vocabScore + accuracy));
}

export function nextDifficulty(previous: string, score: number) {
  const ladder = ["N5", "N4", "N3", "N2", "N1"];
  const index = Math.max(0, ladder.indexOf(previous));
  if (score >= 80 && index < ladder.length - 1) return ladder[index + 1]!;
  if (score < 40 && index > 0) return ladder[index - 1]!;
  return ladder[index]!;
}

export function pronunciationScore(target: string, heard: string) {
  const clean = (value: string) => value.replace(/[\s。、！？]/g, "");
  const a = clean(target);
  const b = clean(heard);
  if (!a || !b) return 0;
  let hits = 0;
  for (const char of new Set(b)) {
    if (a.includes(char)) hits += 1;
  }
  const coverage = hits / new Set(a).size;
  const lengthPenalty = Math.min(1, b.length / a.length);
  return Math.round(Math.max(0, Math.min(1, coverage * lengthPenalty)) * 100);
}
