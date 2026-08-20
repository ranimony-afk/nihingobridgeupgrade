/**
 * Kana → romaji transliteration for the search index.
 *
 * The knowledge graph stores readings in kana only, so a learner typing
 * "taberu" would never reach 食べる. Indexing romaji alongside kana closes
 * that gap without adding a data dependency.
 */

const DIGRAPHS: Record<string, string> = {
  きゃ: "kya", きゅ: "kyu", きょ: "kyo",
  ぎゃ: "gya", ぎゅ: "gyu", ぎょ: "gyo",
  しゃ: "sha", しゅ: "shu", しょ: "sho",
  じゃ: "ja", じゅ: "ju", じょ: "jo",
  ちゃ: "cha", ちゅ: "chu", ちょ: "cho",
  ぢゃ: "ja", ぢゅ: "ju", ぢょ: "jo",
  にゃ: "nya", にゅ: "nyu", にょ: "nyo",
  ひゃ: "hya", ひゅ: "hyu", ひょ: "hyo",
  びゃ: "bya", びゅ: "byu", びょ: "byo",
  ぴゃ: "pya", ぴゅ: "pyu", ぴょ: "pyo",
  みゃ: "mya", みゅ: "myu", みょ: "myo",
  りゃ: "rya", りゅ: "ryu", りょ: "ryo",
};

const MONOGRAPHS: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", ゐ: "i", ゑ: "e", を: "o", ん: "n",
  ゔ: "vu", ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
  ゃ: "ya", ゅ: "yu", ょ: "yo",
};

/** Katakana occupies the same order as hiragana, 0x60 higher. */
function katakanaToHiragana(value: string) {
  return value.replace(/[\u30a1-\u30f6]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  );
}

export function toRomaji(input: string): string {
  if (!input) return "";
  const kana = katakanaToHiragana(input.normalize("NFKC"));
  let out = "";
  let index = 0;

  while (index < kana.length) {
    const pair = kana.slice(index, index + 2);
    if (DIGRAPHS[pair]) {
      out += DIGRAPHS[pair];
      index += 2;
      continue;
    }

    const char = kana[index] as string;

    // Sokuon: っ doubles the following consonant.
    if (char === "っ") {
      const nextPair = kana.slice(index + 1, index + 3);
      const next = kana[index + 1] ?? "";
      const romaji = DIGRAPHS[nextPair] ?? MONOGRAPHS[next] ?? "";
      if (romaji) out += romaji[0];
      index += 1;
      continue;
    }

    // Chōonpu: ー lengthens the previous vowel.
    if (char === "ー") {
      const last = out[out.length - 1];
      if (last && "aiueo".includes(last)) out += last;
      index += 1;
      continue;
    }

    if (MONOGRAPHS[char]) {
      out += MONOGRAPHS[char];
      index += 1;
      continue;
    }

    // Pass through anything that is not kana (kanji, latin, punctuation).
    out += char;
    index += 1;
  }

  return out;
}

/**
 * Romaji variants worth indexing. Learners type both "toukyou" and "tokyo",
 * so we index the faithful transliteration plus a shortened long-vowel form.
 */
export function romajiVariants(input: string) {
  const base = toRomaji(input);
  const collapsed = base
    .replace(/ou/g, "o")
    .replace(/uu/g, "u")
    .replace(/([aiueo])\1+/g, "$1");
  return base === collapsed ? [base] : [base, collapsed];
}
