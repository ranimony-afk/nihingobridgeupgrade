/**
 * Synthetic JMdict Test Fixtures — Phase 14.2.
 *
 * Compact synthetic test cases covering all 15 boundary conditions:
 * 1. Single orthography / reading
 * 2. Multiple orthographies (primary + variants)
 * 3. Multiple readings
 * 4. Kana-only entry (no kanji element)
 * 5. Reading restriction (re_restr)
 * 6. Multiple senses
 * 7. Multiple POS tags
 * 8. Field / dialect / misc tags
 * 9. Multilingual glosses (eng, ger, fre)
 * 10. Priority metadata (ichi1, news1, nf01)
 * 11. Duplicate ent_seq (identical)
 * 12. Duplicate ent_seq (conflicting)
 * 13. Malformed entry (missing required fields)
 * 14. Missing ent_seq
 * 15. Unknown POS code
 */

import type { RawJMdictSourceRecord } from "./types";

export const SYNTHETIC_JMDICT_RECORDS: RawJMdictSourceRecord[] = [
  // 1. Single orthography and single reading (Basic)
  {
    entSeq: "9000001",
    kanji: [{ keb: "水", kePri: ["ichi1", "nf01"] }],
    readings: [{ reb: "みず", rePri: ["ichi1", "nf01"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [{ lang: "eng", text: "water" }],
        sInf: "cool, fresh water",
      },
    ],
    jlptLevel: "N5",
    frequencyRank: 100,
  },

  // 2. Multiple orthographies
  {
    entSeq: "9000002",
    kanji: [
      { keb: "引っ越す", kePri: ["ichi1"] },
      { keb: "引越す" },
      { keb: "引き越す" },
    ],
    readings: [{ reb: "ひっこす", rePri: ["ichi1"] }],
    senses: [
      {
        pos: ["v5s", "vi"],
        glosses: [{ lang: "eng", text: "to move (house)" }],
      },
    ],
    jlptLevel: "N4",
  },

  // 3. Multiple readings
  {
    entSeq: "9000003",
    kanji: [{ keb: "明日", kePri: ["ichi1", "news1"] }],
    readings: [
      { reb: "あした", rePri: ["ichi1"] },
      { reb: "あす", rePri: ["news1"] },
      { reb: "みょうにち" },
    ],
    senses: [
      {
        pos: ["n-adv", "n-t"],
        glosses: [{ lang: "eng", text: "tomorrow" }],
      },
    ],
    jlptLevel: "N5",
  },

  // 4. Kana-only entry (no kanji)
  {
    entSeq: "9000004",
    kanji: [],
    readings: [{ reb: "きれい", rePri: ["ichi1"] }],
    senses: [
      {
        pos: ["adj-na"],
        glosses: [
          { lang: "eng", text: "pretty" },
          { lang: "eng", text: "clean" },
        ],
      },
    ],
    jlptLevel: "N5",
  },

  // 5. Reading restriction (re_restr)
  {
    entSeq: "9000005",
    kanji: [{ keb: "角" }, { keb: "隅" }],
    readings: [
      { reb: "かど", reRestr: ["角"] },
      { reb: "つの", reRestr: ["角"] },
      { reb: "すみ", reRestr: ["隅"] },
    ],
    senses: [
      {
        pos: ["n"],
        glosses: [{ lang: "eng", text: "corner; horn; angle" }],
      },
    ],
    jlptLevel: "N4",
  },

  // 6. Multiple senses
  {
    entSeq: "9000006",
    kanji: [{ keb: "取る", kePri: ["ichi1"] }],
    readings: [{ reb: "とる", rePri: ["ichi1"] }],
    senses: [
      {
        pos: ["v5r", "vt"],
        glosses: [{ lang: "eng", text: "to take" }],
      },
      {
        pos: ["v5r", "vt"],
        glosses: [{ lang: "eng", text: "to catch (e.g. fish)" }],
      },
      {
        pos: ["v5r", "vt"],
        glosses: [{ lang: "eng", text: "to harvest" }],
      },
    ],
    jlptLevel: "N5",
  },

  // 7. Multiple POS tags
  {
    entSeq: "9000007",
    kanji: [{ keb: "勉強", kePri: ["ichi1"] }],
    readings: [{ reb: "べんきょう", rePri: ["ichi1"] }],
    senses: [
      {
        pos: ["n", "vs"],
        glosses: [{ lang: "eng", text: "study" }],
      },
    ],
    jlptLevel: "N5",
  },

  // 8. Field, dialect, and misc tags
  {
    entSeq: "9000008",
    kanji: [{ keb: "大気" }],
    readings: [{ reb: "たいき" }],
    senses: [
      {
        pos: ["n"],
        field: ["meteor"],
        misc: ["uk"],
        dial: ["ksb"],
        glosses: [{ lang: "eng", text: "atmosphere" }],
      },
    ],
    jlptLevel: "N2",
  },

  // 9. Multilingual glosses
  {
    entSeq: "9000009",
    kanji: [{ keb: "猫" }],
    readings: [{ reb: "ねこ" }],
    senses: [
      {
        pos: ["n"],
        glosses: [
          { lang: "eng", text: "cat" },
          { lang: "ger", text: "Katze" },
          { lang: "fre", text: "chat" },
        ],
      },
    ],
    jlptLevel: "N5",
  },

  // 10. Priority metadata (news1, spec1, nf02)
  {
    entSeq: "9000010",
    kanji: [{ keb: "首相", kePri: ["news1", "spec1", "nf02"] }],
    readings: [{ reb: "しゅしょう", rePri: ["news1", "spec1", "nf02"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [{ lang: "eng", text: "prime minister" }],
      },
    ],
    jlptLevel: "N2",
  },

  // 11. Duplicate ent_seq (identical to #9000001)
  {
    entSeq: "9000001",
    kanji: [{ keb: "水", kePri: ["ichi1", "nf01"] }],
    readings: [{ reb: "みず", rePri: ["ichi1", "nf01"] }],
    senses: [
      {
        pos: ["n"],
        glosses: [{ lang: "eng", text: "water" }],
        sInf: "cool, fresh water",
      },
    ],
    jlptLevel: "N5",
  },

  // 12. Duplicate ent_seq (conflicting definition)
  {
    entSeq: "9000001",
    kanji: [{ keb: "水", kePri: ["ichi1"] }],
    readings: [{ reb: "みず" }],
    senses: [
      {
        pos: ["n"],
        glosses: [{ lang: "eng", text: "liquid; fluid" }],
      },
    ],
  },

  // 13. Malformed entry (missing senses)
  {
    entSeq: "9000013",
    kanji: [{ keb: "不完全" }],
    readings: [{ reb: "ふかんぜん" }],
    senses: [],
  },

  // 14. Missing ent_seq
  {
    entSeq: "",
    kanji: [{ keb: "無番号" }],
    readings: [{ reb: "むばんごう" }],
    senses: [
      {
        pos: ["n"],
        glosses: [{ lang: "eng", text: "no number" }],
      },
    ],
  },

  // 15. Unknown POS code (must trigger diagnostic warning, not crash)
  {
    entSeq: "9000015",
    kanji: [{ keb: "珍奇語" }],
    readings: [{ reb: "ちんきご" }],
    senses: [
      {
        pos: ["custom-experimental-pos"],
        glosses: [{ lang: "eng", text: "rare exotic word" }],
      },
    ],
  },
];

/**
 * Compact Synthetic JMdict XML snippet containing representative entries.
 */
export const SYNTHETIC_JMDICT_XML_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<JMdict>
  <entry>
    <ent_seq>9000001</ent_seq>
    <k_ele>
      <keb>水</keb>
      <ke_pri>ichi1</ke_pri>
      <ke_pri>nf01</ke_pri>
    </k_ele>
    <r_ele>
      <reb>みず</reb>
      <re_pri>ichi1</re_pri>
      <re_pri>nf01</re_pri>
    </r_ele>
    <sense>
      <pos>&n;</pos>
      <gloss xml:lang="eng">water</gloss>
      <s_inf>cool, fresh water</s_inf>
    </sense>
  </entry>
  <entry>
    <ent_seq>9000004</ent_seq>
    <r_ele>
      <reb>きれい</reb>
      <re_pri>ichi1</re_pri>
    </r_ele>
    <sense>
      <pos>&adj-na;</pos>
      <gloss xml:lang="eng">pretty</gloss>
      <gloss xml:lang="eng">clean</gloss>
    </sense>
  </entry>
  <entry>
    <ent_seq>9000015</ent_seq>
    <k_ele>
      <keb>珍奇語</keb>
    </k_ele>
    <r_ele>
      <reb>ちんきご</reb>
    </r_ele>
    <sense>
      <pos>custom-experimental-pos</pos>
      <gloss xml:lang="eng">rare exotic word</gloss>
    </sense>
  </entry>
</JMdict>`;
