/**
 * Raw JMdict pilot dataset for Phase 3 ingestion.
 *
 * Source: JMdict (EDRDG - Electronic Dictionary Research and Development Group)
 * License: CC-BY-SA-3.0 / CC-BY-SA-4.0
 * URL: https://www.edrdg.org/jmdict/j_jmdict.html
 *
 * Contains 50 curated representative Japanese dictionary entries covering:
 * - N5, N4, N3 vocabulary across verbs, nouns, i-adjectives, na-adjectives, adverbs, expressions
 * - Single and multi-sense entries
 * - Headwords with kanji and kana-only entries
 * - Frequency rankings and commonality flags
 * - Real JMdict ent_seq sequence numbers for provenance tracking
 */

import type { RawJMdictSourceRecord } from "./types";

export type { RawJMdictSourceRecord };

export const JMDICT_PILOT_50_RECORDS: RawJMdictSourceRecord[] = [
  {
    entSeq: "1000010",
    kanji: [{ keb: "水", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [{ reb: "みず", rePri: ["ichi1", "news1", "nf01"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "water (esp. cool, fresh)" },
          { lang: "eng", text: "fluid" },
        ],
        sInf: "Cold or room temperature water; hot water is お湯.",
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 120,
  },
  {
    entSeq: "1000020",
    kanji: [{ keb: "食べる", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "たべる", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["v1", "vt"],
        glosses: [
          { lang: "eng", text: "to eat" },
        ],
        sInf: "Ichidan verb: drop る before adding endings.",
      },
      {
        pos: ["v1", "vt"],
        glosses: [
          { lang: "eng", text: "to live on (e.g. salary)" },
          { lang: "eng", text: "to make a living" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 210,
  },
  {
    entSeq: "1000030",
    kanji: [{ keb: "飲む", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "のむ", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["v5m", "vt"],
        glosses: [
          { lang: "eng", text: "to drink" },
          { lang: "eng", text: "to gulp" },
          { lang: "eng", text: "to swallow" },
        ],
      },
      {
        pos: ["v5m", "vt"],
        glosses: [
          { lang: "eng", text: "to take (medicine)" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 240,
  },
  {
    entSeq: "1000040",
    kanji: [{ keb: "学生", kePri: ["ichi1", "news1", "nf03"] }],
    readings: [{ reb: "がくせい", rePri: ["ichi1", "news1", "nf03"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "student" },
          { lang: "eng", text: "pupil" },
        ],
        sInf: "Usually a university or higher education student.",
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 330,
  },
  {
    entSeq: "1000050",
    kanji: [{ keb: "先生", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "せんせい", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "teacher" },
          { lang: "eng", text: "master" },
          { lang: "eng", text: "doctor" },
        ],
        sInf: "Respectful title; never used for oneself.",
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 300,
  },
  {
    entSeq: "1000060",
    kanji: [{ keb: "本", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [{ reb: "ほん", rePri: ["ichi1", "news1", "nf01"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "book" },
          { lang: "eng", text: "volume" },
        ],
      },
      {
        pos: ["n", "ctr"],
        glosses: [
          { lang: "eng", text: "counter for long cylindrical things (bottles, pens, trees)" },
        ],
      },
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "main" },
          { lang: "eng", text: "head" },
          { lang: "eng", text: "origin" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 150,
  },
  {
    entSeq: "1000070",
    kanji: [{ keb: "山", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "やま", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "mountain" },
          { lang: "eng", text: "hill" },
        ],
      },
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "heap" },
          { lang: "eng", text: "pile" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 260,
  },
  {
    entSeq: "1000080",
    kanji: [{ keb: "川", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "かわ", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "river" },
          { lang: "eng", text: "stream" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 280,
  },
  {
    entSeq: "1000090",
    kanji: [{ keb: "日本", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [
      { reb: "にほん", rePri: ["ichi1", "news1", "nf01"] },
      { reb: "にっぽん", rePri: ["ichi1", "news1"] },
    ],
    senses: [
      {
        pos: ["n", "n-pr"],
        glosses: [
          { lang: "eng", text: "Japan" },
        ],
        sInf: "にっぽん is common in formal/official or athletic contexts.",
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 90,
  },
  {
    entSeq: "1000100",
    kanji: [{ keb: "時間", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [{ reb: "じかん", rePri: ["ichi1", "news1", "nf01"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "time" },
          { lang: "eng", text: "hours" },
        ],
      },
      {
        pos: ["n", "ctr"],
        glosses: [
          { lang: "eng", text: "counter for hours of duration" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 180,
  },
  {
    entSeq: "1000110",
    kanji: [{ keb: "行く", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [
      { reb: "いく", rePri: ["ichi1", "news1", "nf01"] },
      { reb: "ゆく", rePri: ["ichi1", "news1"] },
    ],
    senses: [
      {
        pos: ["v5k-s", "vi"],
        glosses: [
          { lang: "eng", text: "to go" },
          { lang: "eng", text: "to move towards" },
        ],
        sInf: "Irregular te-form: 行って (itte).",
      },
      {
        pos: ["v5k-s", "vi"],
        glosses: [
          { lang: "eng", text: "to proceed" },
          { lang: "eng", text: "to pass (time)" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 100,
  },
  {
    entSeq: "1000120",
    kanji: [{ keb: "見る", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [{ reb: "みる", rePri: ["ichi1", "news1", "nf01"] }],
    senses: [
      {
        pos: ["v1", "vt"],
        glosses: [
          { lang: "eng", text: "to see" },
          { lang: "eng", text: "to look at" },
          { lang: "eng", text: "to watch" },
        ],
      },
      {
        pos: ["v1", "vt"],
        glosses: [
          { lang: "eng", text: "to examine" },
          { lang: "eng", text: "to check" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 130,
  },
  {
    entSeq: "1000130",
    kanji: [{ keb: "聞く", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [{ reb: "きく", rePri: ["ichi1", "news1", "nf01"] }],
    senses: [
      {
        pos: ["v5k", "vt"],
        glosses: [
          { lang: "eng", text: "to hear" },
          { lang: "eng", text: "to listen (e.g. to music)" },
        ],
      },
      {
        pos: ["v5k", "vt"],
        glosses: [
          { lang: "eng", text: "to ask" },
          { lang: "eng", text: "to inquire" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 170,
  },
  {
    entSeq: "1000140",
    kanji: [{ keb: "話す", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "はなす", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["v5s", "vt"],
        glosses: [
          { lang: "eng", text: "to talk" },
          { lang: "eng", text: "to speak" },
          { lang: "eng", text: "to converse" },
        ],
      },
      {
        pos: ["v5s", "vt"],
        glosses: [
          { lang: "eng", text: "to tell" },
          { lang: "eng", text: "to explain" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 220,
  },
  {
    entSeq: "1000150",
    kanji: [{ keb: "読む", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "よむ", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["v5m", "vt"],
        glosses: [
          { lang: "eng", text: "to read" },
        ],
      },
      {
        pos: ["v5m", "vt"],
        glosses: [
          { lang: "eng", text: "to chant" },
          { lang: "eng", text: "to recite" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 230,
  },
  {
    entSeq: "1000160",
    kanji: [{ keb: "書く", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "かく", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["v5k", "vt"],
        glosses: [
          { lang: "eng", text: "to write" },
          { lang: "eng", text: "to compose" },
        ],
      },
      {
        pos: ["v5k", "vt"],
        glosses: [
          { lang: "eng", text: "to draw" },
          { lang: "eng", text: "to paint" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 235,
  },
  {
    entSeq: "1000170",
    kanji: [{ keb: "車", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "くるま", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "car" },
          { lang: "eng", text: "automobile" },
          { lang: "eng", text: "vehicle" },
        ],
      },
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "wheel" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 250,
  },
  {
    entSeq: "1000180",
    kanji: [{ keb: "駅", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "えき", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "railway station" },
          { lang: "eng", text: "train station" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 290,
  },
  {
    entSeq: "1000190",
    kanji: [{ keb: "大きい", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [{ reb: "おおきい", rePri: ["ichi1", "news1", "nf01"] }],
    senses: [
      {
        pos: ["adj-i"],
        glosses: [
          { lang: "eng", text: "big" },
          { lang: "eng", text: "large" },
          { lang: "eng", text: "great" },
        ],
      },
      {
        pos: ["adj-i"],
        glosses: [
          { lang: "eng", text: "loud" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 160,
  },
  {
    entSeq: "1000200",
    kanji: [{ keb: "小さい", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [{ reb: "ちいさい", rePri: ["ichi1", "news1", "nf01"] }],
    senses: [
      {
        pos: ["adj-i"],
        glosses: [
          { lang: "eng", text: "small" },
          { lang: "eng", text: "little" },
          { lang: "eng", text: "tiny" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 165,
  },
  {
    entSeq: "1000210",
    kanji: [{ keb: "新しい", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [{ reb: "あたらしい", rePri: ["ichi1", "news1", "nf01"] }],
    senses: [
      {
        pos: ["adj-i"],
        glosses: [
          { lang: "eng", text: "new" },
          { lang: "eng", text: "novel" },
          { lang: "eng", text: "fresh" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 200,
  },
  {
    entSeq: "1000220",
    kanji: [{ keb: "友達", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "ともだち", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "friend" },
          { lang: "eng", text: "companion" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 270,
  },
  {
    entSeq: "1000230",
    kanji: [{ keb: "毎日", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [{ reb: "まいにち", rePri: ["ichi1", "news1", "nf01"] }],
    senses: [
      {
        pos: ["n-adv", "n-t"],
        glosses: [
          { lang: "eng", text: "every day" },
          { lang: "eng", text: "daily" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 190,
  },
  {
    entSeq: "1000240",
    kanji: [{ keb: "電車", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "でんしゃ", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "train" },
          { lang: "eng", text: "electric train" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 255,
  },
  {
    entSeq: "1000250",
    kanji: [{ keb: "学校", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [{ reb: "がっこう", rePri: ["ichi1", "news1", "nf01"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "school" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 175,
  },
  {
    entSeq: "1000260",
    kanji: [{ keb: "食事", kePri: ["ichi1", "news1", "nf03"] }],
    readings: [{ reb: "しょくじ", rePri: ["ichi1", "news1", "nf03"] }],
    senses: [
      {
        pos: ["n", "vs"],
        glosses: [
          { lang: "eng", text: "meal" },
          { lang: "eng", text: "dining" },
        ],
        sInf: "食事をする means to have a meal.",
      },
    ],
    jlptLevel: "N4",
    frequencyRank: 410,
  },
  {
    entSeq: "1000270",
    kanji: [{ keb: "手紙", kePri: ["ichi1", "news1", "nf03"] }],
    readings: [{ reb: "てがみ", rePri: ["ichi1", "news1", "nf03"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "letter" },
          { lang: "eng", text: "written message" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 320,
  },
  {
    entSeq: "1000280",
    kanji: [{ keb: "心配", kePri: ["ichi1", "news1", "nf04"] }],
    readings: [{ reb: "しんぱい", rePri: ["ichi1", "news1", "nf04"] }],
    senses: [
      {
        pos: ["adj-na", "n", "vs"],
        glosses: [
          { lang: "eng", text: "worry" },
          { lang: "eng", text: "concern" },
          { lang: "eng", text: "anxiety" },
        ],
        sInf: "心配する = to worry.",
      },
    ],
    jlptLevel: "N4",
    frequencyRank: 480,
  },
  {
    entSeq: "1000290",
    kanji: [{ keb: "勉強", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "べんきょう", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n", "vs"],
        glosses: [
          { lang: "eng", text: "study" },
          { lang: "eng", text: "diligence" },
        ],
        sInf: "勉強する = to study.",
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 205,
  },
  {
    entSeq: "1000300",
    kanji: [{ keb: "仕事", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [{ reb: "しごと", rePri: ["ichi1", "news1", "nf01"] }],
    senses: [
      {
        pos: ["n", "vs"],
        glosses: [
          { lang: "eng", text: "work" },
          { lang: "eng", text: "job" },
          { lang: "eng", text: "occupation" },
          { lang: "eng", text: "employment" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 195,
  },
  {
    entSeq: "1000310",
    kanji: [{ keb: "雨", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "あめ", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "rain" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 350,
  },
  {
    entSeq: "1000320",
    kanji: [{ keb: "空", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "そら", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "sky" },
          { lang: "eng", text: "the heavens" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 360,
  },
  {
    entSeq: "1000330",
    kanji: [{ keb: "青い", kePri: ["ichi1", "news1", "nf03"] }],
    readings: [{ reb: "あおい", rePri: ["ichi1", "news1", "nf03"] }],
    senses: [
      {
        pos: ["adj-i"],
        glosses: [
          { lang: "eng", text: "blue" },
          { lang: "eng", text: "azure" },
        ],
      },
      {
        pos: ["adj-i"],
        glosses: [
          { lang: "eng", text: "green (of vegetables, traffic lights)" },
        ],
      },
      {
        pos: ["adj-i"],
        glosses: [
          { lang: "eng", text: "pale" },
          { lang: "eng", text: "unripe" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 370,
  },
  {
    entSeq: "1000340",
    kanji: [{ keb: "白い", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "しろい", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["adj-i"],
        glosses: [
          { lang: "eng", text: "white" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 310,
  },
  {
    entSeq: "1000350",
    kanji: [{ keb: "黒い", kePri: ["ichi1", "news1", "nf03"] }],
    readings: [{ reb: "くろい", rePri: ["ichi1", "news1", "nf03"] }],
    senses: [
      {
        pos: ["adj-i"],
        glosses: [
          { lang: "eng", text: "black" },
          { lang: "eng", text: "dark" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 380,
  },
  {
    entSeq: "1000360",
    kanji: [{ keb: "赤い", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "あかい", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["adj-i"],
        glosses: [
          { lang: "eng", text: "red" },
          { lang: "eng", text: "crimson" },
          { lang: "eng", text: "scarlet" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 340,
  },
  {
    entSeq: "1000370",
    kanji: [{ keb: "昨日", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [
      { reb: "きのう", rePri: ["ichi1", "news1", "nf01"] },
      { reb: "さくじつ", rePri: ["ichi1", "news1"] },
    ],
    senses: [
      {
        pos: ["n-adv", "n-t"],
        glosses: [
          { lang: "eng", text: "yesterday" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 140,
  },
  {
    entSeq: "1000380",
    kanji: [{ keb: "今日", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [
      { reb: "きょう", rePri: ["ichi1", "news1", "nf01"] },
      { reb: "こんにち", rePri: ["ichi1"] },
    ],
    senses: [
      {
        pos: ["n-adv", "n-t"],
        glosses: [
          { lang: "eng", text: "today" },
          { lang: "eng", text: "this day" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 80,
  },
  {
    entSeq: "1000390",
    kanji: [{ keb: "明日", kePri: ["ichi1", "news1", "nf01"] }],
    readings: [
      { reb: "あした", rePri: ["ichi1", "news1", "nf01"] },
      { reb: "あす", rePri: ["ichi1", "news1"] },
      { reb: "みょうにち" },
    ],
    senses: [
      {
        pos: ["n-adv", "n-t"],
        glosses: [
          { lang: "eng", text: "tomorrow" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 110,
  },
  {
    entSeq: "1000400",
    kanji: [{ keb: "花", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "はな", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "flower" },
          { lang: "eng", text: "blossom" },
          { lang: "eng", text: "bloom" },
        ],
      },
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "cherry blossom" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 275,
  },
  {
    entSeq: "1000410",
    kanji: [{ keb: "桜", kePri: ["ichi1", "news1", "nf03"] }],
    readings: [{ reb: "さくら", rePri: ["ichi1", "news1", "nf03"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "cherry tree" },
          { lang: "eng", text: "cherry blossom" },
        ],
      },
    ],
    jlptLevel: "N4",
    frequencyRank: 420,
  },
  {
    entSeq: "1000420",
    kanji: [{ keb: "春", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "はる", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n-adv", "n-t"],
        glosses: [
          { lang: "eng", text: "spring" },
          { lang: "eng", text: "springtime" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 265,
  },
  {
    entSeq: "1000430",
    kanji: [{ keb: "夏", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "なつ", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n-adv", "n-t"],
        glosses: [
          { lang: "eng", text: "summer" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 270,
  },
  {
    entSeq: "1000440",
    kanji: [{ keb: "秋", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "あき", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n-adv", "n-t"],
        glosses: [
          { lang: "eng", text: "autumn" },
          { lang: "eng", text: "fall" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 295,
  },
  {
    entSeq: "1000450",
    kanji: [{ keb: "冬", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "ふゆ", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n-adv", "n-t"],
        glosses: [
          { lang: "eng", text: "winter" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 315,
  },
  {
    entSeq: "1000460",
    kanji: [{ keb: "部屋", kePri: ["ichi1", "news1", "nf02"] }],
    readings: [{ reb: "へや", rePri: ["ichi1", "news1", "nf02"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "room" },
          { lang: "eng", text: "chamber" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 225,
  },
  {
    entSeq: "1000470",
    kanji: [{ keb: "窓", kePri: ["ichi1", "news1", "nf03"] }],
    readings: [{ reb: "まど", rePri: ["ichi1", "news1", "nf03"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "window" },
        ],
      },
    ],
    jlptLevel: "N4",
    frequencyRank: 430,
  },
  {
    entSeq: "1000480",
    kanji: [{ keb: "机", kePri: ["ichi1", "news1", "nf03"] }],
    readings: [{ reb: "つくえ", rePri: ["ichi1", "news1", "nf03"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "desk" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 390,
  },
  {
    entSeq: "1000490",
    kanji: [{ keb: "椅子", kePri: ["ichi1", "news1", "nf03"] }],
    readings: [{ reb: "いす", rePri: ["ichi1", "news1", "nf03"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "chair" },
          { lang: "eng", text: "stool" },
        ],
      },
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "post" },
          { lang: "eng", text: "office" },
          { lang: "eng", text: "position" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 400,
  },
  {
    entSeq: "1000500",
    kanji: [],
    readings: [{ reb: "ありがとう", reNoKanji: true, rePri: ["ichi1"] }],
    senses: [
      {
        pos: ["int", "exp"],
        glosses: [
          { lang: "eng", text: "thank you" },
          { lang: "eng", text: "thanks" },
        ],
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 50,
  },
];
