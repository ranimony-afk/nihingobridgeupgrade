/**
 * First-party kana reference data.
 *
 * Provenance: authored in-repository. Kana readings are standard, non-copyrightable
 * language facts. Every row records sourceRef so a licensed dataset could replace
 * this later without a schema change.
 *
 * Layout: [romaji, hiragana, katakana] triples per consonant row.
 */

export type KanaCategory = "gojuon" | "dakuten" | "handakuten" | "yoon";

export interface KanaRowDef {
  rowKey: string;
  rowLabel: string;
  category: KanaCategory;
  /** [romaji, hiragana, katakana, columnKey] */
  cells: Array<[string, string, string, string]>;
}

export const KANA_ROWS: KanaRowDef[] = [
  {
    rowKey: "a",
    rowLabel: "— (vowels)",
    category: "gojuon",
    cells: [
      ["a", "あ", "ア", "a"],
      ["i", "い", "イ", "i"],
      ["u", "う", "ウ", "u"],
      ["e", "え", "エ", "e"],
      ["o", "お", "オ", "o"],
    ],
  },
  {
    rowKey: "k",
    rowLabel: "K",
    category: "gojuon",
    cells: [
      ["ka", "か", "カ", "a"],
      ["ki", "き", "キ", "i"],
      ["ku", "く", "ク", "u"],
      ["ke", "け", "ケ", "e"],
      ["ko", "こ", "コ", "o"],
    ],
  },
  {
    rowKey: "s",
    rowLabel: "S",
    category: "gojuon",
    cells: [
      ["sa", "さ", "サ", "a"],
      ["shi", "し", "シ", "i"],
      ["su", "す", "ス", "u"],
      ["se", "せ", "セ", "e"],
      ["so", "そ", "ソ", "o"],
    ],
  },
  {
    rowKey: "t",
    rowLabel: "T",
    category: "gojuon",
    cells: [
      ["ta", "た", "タ", "a"],
      ["chi", "ち", "チ", "i"],
      ["tsu", "つ", "ツ", "u"],
      ["te", "て", "テ", "e"],
      ["to", "と", "ト", "o"],
    ],
  },
  {
    rowKey: "n",
    rowLabel: "N",
    category: "gojuon",
    cells: [
      ["na", "な", "ナ", "a"],
      ["ni", "に", "ニ", "i"],
      ["nu", "ぬ", "ヌ", "u"],
      ["ne", "ね", "ネ", "e"],
      ["no", "の", "ノ", "o"],
    ],
  },
  {
    rowKey: "h",
    rowLabel: "H",
    category: "gojuon",
    cells: [
      ["ha", "は", "ハ", "a"],
      ["hi", "ひ", "ヒ", "i"],
      ["fu", "ふ", "フ", "u"],
      ["he", "へ", "ヘ", "e"],
      ["ho", "ほ", "ホ", "o"],
    ],
  },
  {
    rowKey: "m",
    rowLabel: "M",
    category: "gojuon",
    cells: [
      ["ma", "ま", "マ", "a"],
      ["mi", "み", "ミ", "i"],
      ["mu", "む", "ム", "u"],
      ["me", "め", "メ", "e"],
      ["mo", "も", "モ", "o"],
    ],
  },
  {
    rowKey: "y",
    rowLabel: "Y",
    category: "gojuon",
    cells: [
      ["ya", "や", "ヤ", "a"],
      ["yu", "ゆ", "ユ", "u"],
      ["yo", "よ", "ヨ", "o"],
    ],
  },
  {
    rowKey: "r",
    rowLabel: "R",
    category: "gojuon",
    cells: [
      ["ra", "ら", "ラ", "a"],
      ["ri", "り", "リ", "i"],
      ["ru", "る", "ル", "u"],
      ["re", "れ", "レ", "e"],
      ["ro", "ろ", "ロ", "o"],
    ],
  },
  {
    rowKey: "w",
    rowLabel: "W",
    category: "gojuon",
    cells: [
      ["wa", "わ", "ワ", "a"],
      ["wo", "を", "ヲ", "o"],
    ],
  },
  {
    rowKey: "n-final",
    rowLabel: "N (final)",
    category: "gojuon",
    cells: [["n", "ん", "ン", "a"]],
  },
  {
    rowKey: "g",
    rowLabel: "G (K + dakuten)",
    category: "dakuten",
    cells: [
      ["ga", "が", "ガ", "a"],
      ["gi", "ぎ", "ギ", "i"],
      ["gu", "ぐ", "グ", "u"],
      ["ge", "げ", "ゲ", "e"],
      ["go", "ご", "ゴ", "o"],
    ],
  },
  {
    rowKey: "z",
    rowLabel: "Z (S + dakuten)",
    category: "dakuten",
    cells: [
      ["za", "ざ", "ザ", "a"],
      ["ji", "じ", "ジ", "i"],
      ["zu", "ず", "ズ", "u"],
      ["ze", "ぜ", "ゼ", "e"],
      ["zo", "ぞ", "ゾ", "o"],
    ],
  },
  {
    rowKey: "d",
    rowLabel: "D (T + dakuten)",
    category: "dakuten",
    cells: [
      ["da", "だ", "ダ", "a"],
      ["ji", "ぢ", "ヂ", "i"],
      ["zu", "づ", "ヅ", "u"],
      ["de", "で", "デ", "e"],
      ["do", "ど", "ド", "o"],
    ],
  },
  {
    rowKey: "b",
    rowLabel: "B (H + dakuten)",
    category: "dakuten",
    cells: [
      ["ba", "ば", "バ", "a"],
      ["bi", "び", "ビ", "i"],
      ["bu", "ぶ", "ブ", "u"],
      ["be", "べ", "ベ", "e"],
      ["bo", "ぼ", "ボ", "o"],
    ],
  },
  {
    rowKey: "p",
    rowLabel: "P (H + handakuten)",
    category: "handakuten",
    cells: [
      ["pa", "ぱ", "パ", "a"],
      ["pi", "ぴ", "ピ", "i"],
      ["pu", "ぷ", "プ", "u"],
      ["pe", "ぺ", "ペ", "e"],
      ["po", "ぽ", "ポ", "o"],
    ],
  },
  {
    rowKey: "ky",
    rowLabel: "KY (K + small ya)",
    category: "yoon",
    cells: [
      ["kya", "きゃ", "キャ", "a"],
      ["kyu", "きゅ", "キュ", "u"],
      ["kyo", "きょ", "キョ", "o"],
    ],
  },
  {
    rowKey: "sh",
    rowLabel: "SHA (S + small ya)",
    category: "yoon",
    cells: [
      ["sha", "しゃ", "シャ", "a"],
      ["shu", "しゅ", "シュ", "u"],
      ["sho", "しょ", "ショ", "o"],
    ],
  },
  {
    rowKey: "ch",
    rowLabel: "CHA (T + small ya)",
    category: "yoon",
    cells: [
      ["cha", "ちゃ", "チャ", "a"],
      ["chu", "ちゅ", "チュ", "u"],
      ["cho", "ちょ", "チョ", "o"],
    ],
  },
  {
    rowKey: "ny",
    rowLabel: "NYA (N + small ya)",
    category: "yoon",
    cells: [
      ["nya", "にゃ", "ニャ", "a"],
      ["nyu", "にゅ", "ニュ", "u"],
      ["nyo", "にょ", "ニョ", "o"],
    ],
  },
  {
    rowKey: "hy",
    rowLabel: "HYA (H + small ya)",
    category: "yoon",
    cells: [
      ["hya", "ひゃ", "ヒャ", "a"],
      ["hyu", "ひゅ", "ヒュ", "u"],
      ["hyo", "ひょ", "ヒョ", "o"],
    ],
  },
  {
    rowKey: "my",
    rowLabel: "MYA (M + small ya)",
    category: "yoon",
    cells: [
      ["mya", "みゃ", "ミャ", "a"],
      ["myu", "みゅ", "ミュ", "u"],
      ["myo", "みょ", "ミョ", "o"],
    ],
  },
  {
    rowKey: "ry",
    rowLabel: "RYA (R + small ya)",
    category: "yoon",
    cells: [
      ["rya", "りゃ", "リャ", "a"],
      ["ryu", "りゅ", "リュ", "u"],
      ["ryo", "りょ", "リョ", "o"],
    ],
  },
  {
    rowKey: "gy",
    rowLabel: "GYA (G + small ya)",
    category: "yoon",
    cells: [
      ["gya", "ぎゃ", "ギャ", "a"],
      ["gyu", "ぎゅ", "ギュ", "u"],
      ["gyo", "ぎょ", "ギョ", "o"],
    ],
  },
  {
    rowKey: "j",
    rowLabel: "JA (Z + small ya)",
    category: "yoon",
    cells: [
      ["ja", "じゃ", "ジャ", "a"],
      ["ju", "じゅ", "ジュ", "u"],
      ["jo", "じょ", "ジョ", "o"],
    ],
  },
  {
    rowKey: "by",
    rowLabel: "BYA (B + small ya)",
    category: "yoon",
    cells: [
      ["bya", "びゃ", "ビャ", "a"],
      ["byu", "びゅ", "ビュ", "u"],
      ["byo", "びょ", "ビョ", "o"],
    ],
  },
  {
    rowKey: "py",
    rowLabel: "PYA (P + small ya)",
    category: "yoon",
    cells: [
      ["pya", "ぴゃ", "ピャ", "a"],
      ["pyu", "ぴゅ", "ピュ", "u"],
      ["pyo", "ぴょ", "ピョ", "o"],
    ],
  },
];

/** The unmodified base kana a derived form is built from. */
const DAKUTEN_BASE: Record<string, string> = {
  が: "か", ぎ: "き", ぐ: "く", げ: "け", ご: "こ",
  ざ: "さ", じ: "し", ず: "す", ぜ: "せ", ぞ: "そ",
  だ: "た", ぢ: "ち", づ: "つ", で: "て", ど: "と",
  ば: "は", び: "ひ", ぶ: "ふ", べ: "へ", ぼ: "ほ",
  ぱ: "は", ぴ: "ひ", ぷ: "ふ", ぺ: "へ", ぽ: "ほ",
  ガ: "カ", ギ: "キ", グ: "ク", ゲ: "ケ", ゴ: "コ",
  ザ: "サ", ジK: "シ", ズ: "ス", ゼ: "セ", ゾ: "ソ",
  ダ: "タ", ヂ: "チ", ヅ: "ツ", デ: "テ", ド: "ト",
  バ: "ハ", ビ: "ヒ", ブ: "フ", ベ: "ヘ", ボ: "ホ",
  パ: "ハ", ピ: "ヒ", プ: "フ", ペ: "ヘ", ポ: "ホ",
};

/** Short original mnemonics for the base hiragana set. */
const HIRAGANA_MNEMONICS: Record<string, string> = {
  あ: "An 'A' with an antenna leaning on a cross.",
  い: "Two reeds standing in a stream.",
  う: "A person's ear with a sideways flourish.",
  え: "An energetic figure doing a gymnastic kick.",
  お: "Like あ, but with a trailing tail — 'oh!'",
  か: "A kite (ka) tangled in string.",
  き: "A key (ki) with two teeth.",
  く: "A cuckoo's beak (ku) opening.",
  け: "A keg (ke) lying on its side.",
  こ: "Two small boxes stacked (ko).",
  さ: "A sage leaf (sa) blowing to one side.",
  し: "A fishing hook — 'she' caught something.",
  す: "A loop with a long tail — 'soo' the slide.",
  せ: "A sen (coin) with a crossbar.",
  そ: "A zigzag sewing (so) pattern.",
  た: "The letter 't' with an 'a' beside it — ta.",
  ち: "A chin (chi) in profile.",
  つ: "A tsunami (tsu) wave curling over.",
  て: "A hand (te) reaching out.",
  と: "A top (to) spinning with its string.",
  な: "A nun (na) kneeling with a crossed arm.",
  に: "A needle (ni) with two threads — also に = two.",
  ぬ: "Noodles (nu) being lifted by chopsticks.",
  ね: "A cat (neko) with a curled tail.",
  の: "A swirling donut — no!",
  は: "A person (ha) with a tall hat waving.",
  ひ: "A smiling mouth saying 'hee'.",
  ふ: "Mount Fuji (fu) with clouds at the peak.",
  へ: "A hill (he) to climb over.",
  ほ: "は plus an extra bar — a taller figure.",
  ま: "A mother (ma) with a scarf knot.",
  み: "The number 3 (san) crossed out — 'mi' = three in old counting.",
  む: "A cow (moo) with horns facing left.",
  め: "An eye (me) with a lash — め means eye.",
  も: "A fishhook catching two — 'mo' more fish.",
  や: "A yak (ya) with a slanting horn.",
  ゆ: "A fish (yu) swimming downward.",
  よ: "A lasso (yo) being swung.",
  ら: "A lamp (ra) with a shade and a hand.",
  り: "Two parallel rails — 'ree' the railway.",
  る: "A loop (ru) with a knot at the end.",
  れ: "Like る but the tail flicks away.",
  ろ: "Like る without the knot — a road (ro) ending.",
  わ: "A wagging (wa) dog tail on a stand.",
  を: "A marksman's target — 'o' as an object marker.",
  ん: "An 'n' with a trailing flourish.",
};

export const KANA_SOURCE_REF = "first-party:kana:v1";

export interface FlatKana {
  id: string;
  character: string;
  script: "hiragana" | "katakana";
  romaji: string;
  category: KanaCategory;
  rowKey: string;
  rowLabel: string;
  columnKey: string;
  baseCharacter: string | null;
  mnemonic: string | null;
  sourceRef: string;
  orderIndex: number;
}

/** Expand the row definitions into every hiragana + katakana entry. */
export function buildKanaDataset(): FlatKana[] {
  const out: FlatKana[] = [];
  let order = 0;

  for (const row of KANA_ROWS) {
    for (const [romaji, hira, kata, columnKey] of row.cells) {
      // Katakana dakuten/yoon lookups need a katakana-specific base map; only
      // hiragana mnemonics are authored, so derived forms inherit nothing.
      const hiraBase = DAKUTEN_BASE[hira] ?? null;
      const kataBase = DAKUTEN_BASE[kata]?.replace("ジK", "シ") ?? null;

      for (const script of ["hiragana", "katakana"] as const) {
        const character = script === "hiragana" ? hira : kata;
        const id = `${script === "hiragana" ? "hira" : "kata"}-${romaji}-${row.rowKey}`;

        out.push({
          id,
          character,
          script,
          romaji,
          category: row.category,
          rowKey: row.rowKey,
          rowLabel: row.rowLabel,
          columnKey,
          baseCharacter: script === "hiragana" ? hiraBase : kataBase,
          mnemonic: script === "hiragana" ? (HIRAGANA_MNEMONICS[hira] ?? null) : null,
          sourceRef: KANA_SOURCE_REF,
          orderIndex: order,
        });
        order += 1;
      }
    }
    order += 1; // visual gap between rows
  }

  return out;
}

/** Grouped shape the chart UI renders directly. */
export function buildKanaChartGrid() {
  return KANA_ROWS.map((row) => ({
    rowKey: row.rowKey,
    rowLabel: row.rowLabel,
    category: row.category,
    hiragana: row.cells.map(([, hira], i) => ({ character: hira, romaji: row.cells[i][0] })),
    katakana: row.cells.map(([, , kata], i) => ({ character: kata, romaji: row.cells[i][0] })),
  }));
}
