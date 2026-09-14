/**
 * First-party knowledge corpus for dictionary, grammar and example sentences.
 *
 * Provenance: authored in-repository for NihongoBridge. Readings, parts of
 * speech and grammatical structures are standard, non-copyrightable language
 * facts; all glosses, explanations and example sentences are original text.
 * No proprietary dictionary, textbook or exam database is reproduced here.
 *
 * These datasets seed the canonical tables in src/db/schema.ts and are the
 * source records returned by the AI KnowledgeRetriever.
 */

import { KANJI, KANJI_SOURCE_REF } from "@/data/kanji";

export const DICTIONARY_SOURCE_REF = "first-party:dictionary-core:v1";
export const GRAMMAR_SOURCE_REF = "first-party:grammar-core:v1";
export const SENTENCE_SOURCE_REF = "first-party:sentences-core:v1";

export interface KnowledgeSourceDef {
  id: string;
  name: string;
  version: string;
  license: string;
  url: string | null;
  description: string;
  domain: "dictionary" | "kanji" | "grammar" | "sentence" | "mixed";
}

export const KNOWLEDGE_SOURCES: KnowledgeSourceDef[] = [
  {
    // The kanji corpus is owned by src/data/kanji.ts; it is registered here so
    // retrieved kanji records resolve to provenance like every other domain.
    id: KANJI_SOURCE_REF,
    name: "NihongoBridge Kanji Mind Tree",
    version: "v1",
    license: "First-party content, all rights reserved by NihongoBridge",
    url: null,
    description:
      "Original kanji decomposition data: meanings, readings, stroke counts, components and mnemonics.",
    domain: "kanji",
  },
  {
    id: DICTIONARY_SOURCE_REF,
    name: "NihongoBridge Core Dictionary",
    version: "v1",
    license: "First-party content, all rights reserved by NihongoBridge",
    url: null,
    description:
      "Original English glosses for common Japanese headwords with kana and romaji readings.",
    domain: "dictionary",
  },
  {
    id: GRAMMAR_SOURCE_REF,
    name: "NihongoBridge Core Grammar",
    version: "v1",
    license: "First-party content, all rights reserved by NihongoBridge",
    url: null,
    description:
      "Original explanations of core JLPT N5–N4 grammar patterns, including common learner mistakes.",
    domain: "grammar",
  },
  {
    id: SENTENCE_SOURCE_REF,
    name: "NihongoBridge Example Sentences",
    version: "v1",
    license: "First-party content, all rights reserved by NihongoBridge",
    url: null,
    description:
      "Original example sentences with kana readings and English translations, linked to grammar and vocabulary.",
    domain: "sentence",
  },
];

export interface DictionaryEntryDef {
  id: string;
  headword: string;
  reading: string;
  romaji: string;
  jlptLevel: string;
  isCommon: boolean;
  frequencyRank: number;
  partsOfSpeech: string[];
  senses: Array<{ glosses: string[]; note?: string | null }>;
  kanjiCharacters: string[];
  tags: string[];
}

export const DICTIONARY_ENTRIES: DictionaryEntryDef[] = [
  { id: "de-mizu", headword: "水", reading: "みず", romaji: "mizu", jlptLevel: "N5", isCommon: true, frequencyRank: 120, partsOfSpeech: ["noun"], senses: [{ glosses: ["water"], note: "Cold or room-temperature water; hot water is お湯." }], kanjiCharacters: ["水"], tags: ["nature", "daily-life"] },
  { id: "de-taberu", headword: "食べる", reading: "たべる", romaji: "taberu", jlptLevel: "N5", isCommon: true, frequencyRank: 210, partsOfSpeech: ["verb", "ichidan"], senses: [{ glosses: ["to eat"], note: "Ichidan verb: drop る before adding endings." }], kanjiCharacters: ["食"], tags: ["food", "verb"] },
  { id: "de-nomu", headword: "飲む", reading: "のむ", romaji: "nomu", jlptLevel: "N5", isCommon: true, frequencyRank: 240, partsOfSpeech: ["verb", "godan"], senses: [{ glosses: ["to drink"], note: "Also used for taking medicine: 薬を飲む." }], kanjiCharacters: ["飲"], tags: ["food", "verb"] },
  { id: "de-gakusei", headword: "学生", reading: "がくせい", romaji: "gakusei", jlptLevel: "N5", isCommon: true, frequencyRank: 330, partsOfSpeech: ["noun"], senses: [{ glosses: ["student"], note: "Usually a university or college student." }], kanjiCharacters: ["学", "生"], tags: ["people", "school"] },
  { id: "de-sensei", headword: "先生", reading: "せんせい", romaji: "sensei", jlptLevel: "N5", isCommon: true, frequencyRank: 300, partsOfSpeech: ["noun"], senses: [{ glosses: ["teacher", "doctor"], note: "Respectful title; never used for yourself." }], kanjiCharacters: ["先", "生"], tags: ["people", "school"] },
  { id: "de-hon", headword: "本", reading: "ほん", romaji: "hon", jlptLevel: "N5", isCommon: true, frequencyRank: 150, partsOfSpeech: ["noun"], senses: [{ glosses: ["book"], note: "Also a counter for long cylindrical objects." }], kanjiCharacters: ["本"], tags: ["objects", "school"] },
  { id: "de-yama", headword: "山", reading: "やま", romaji: "yama", jlptLevel: "N5", isCommon: true, frequencyRank: 260, partsOfSpeech: ["noun"], senses: [{ glosses: ["mountain"], note: null }], kanjiCharacters: ["山"], tags: ["nature"] },
  { id: "de-kawa", headword: "川", reading: "かわ", romaji: "kawa", jlptLevel: "N5", isCommon: true, frequencyRank: 280, partsOfSpeech: ["noun"], senses: [{ glosses: ["river", "stream"], note: null }], kanjiCharacters: ["川"], tags: ["nature"] },
  { id: "de-nihon", headword: "日本", reading: "にほん", romaji: "nihon", jlptLevel: "N5", isCommon: true, frequencyRank: 90, partsOfSpeech: ["noun", "proper-noun"], senses: [{ glosses: ["Japan"], note: "Also read にっぽん in formal contexts." }], kanjiCharacters: ["日", "本"], tags: ["places"] },
  { id: "de-jikan", headword: "時間", reading: "じかん", romaji: "jikan", jlptLevel: "N5", isCommon: true, frequencyRank: 180, partsOfSpeech: ["noun"], senses: [{ glosses: ["time", "hour"], note: "Counts hours as a duration: 二時間 = two hours." }], kanjiCharacters: ["時", "間"], tags: ["time"] },
  { id: "de-iku", headword: "行く", reading: "いく", romaji: "iku", jlptLevel: "N5", isCommon: true, frequencyRank: 100, partsOfSpeech: ["verb", "godan"], senses: [{ glosses: ["to go"], note: "Irregular て-form: 行って." }], kanjiCharacters: ["行"], tags: ["movement", "verb"] },
  { id: "de-miru", headword: "見る", reading: "みる", romaji: "miru", jlptLevel: "N5", isCommon: true, frequencyRank: 130, partsOfSpeech: ["verb", "ichidan"], senses: [{ glosses: ["to see", "to watch", "to look at"], note: null }], kanjiCharacters: ["見"], tags: ["verb", "perception"] },
  { id: "de-kiku", headword: "聞く", reading: "きく", romaji: "kiku", jlptLevel: "N5", isCommon: true, frequencyRank: 170, partsOfSpeech: ["verb", "godan"], senses: [{ glosses: ["to listen", "to hear", "to ask"], note: "Context decides between listening and asking." }], kanjiCharacters: ["聞"], tags: ["verb", "perception"] },
  { id: "de-hanasu", headword: "話す", reading: "はなす", romaji: "hanasu", jlptLevel: "N5", isCommon: true, frequencyRank: 220, partsOfSpeech: ["verb", "godan"], senses: [{ glosses: ["to speak", "to talk"], note: null }], kanjiCharacters: ["話"], tags: ["verb", "communication"] },
  { id: "de-yomu", headword: "読む", reading: "よむ", romaji: "yomu", jlptLevel: "N5", isCommon: true, frequencyRank: 230, partsOfSpeech: ["verb", "godan"], senses: [{ glosses: ["to read"], note: null }], kanjiCharacters: ["読"], tags: ["verb", "school"] },
  { id: "de-kaku", headword: "書く", reading: "かく", romaji: "kaku", jlptLevel: "N5", isCommon: true, frequencyRank: 235, partsOfSpeech: ["verb", "godan"], senses: [{ glosses: ["to write"], note: null }], kanjiCharacters: ["書"], tags: ["verb", "school"] },
  { id: "de-kuruma", headword: "車", reading: "くるま", romaji: "kuruma", jlptLevel: "N5", isCommon: true, frequencyRank: 250, partsOfSpeech: ["noun"], senses: [{ glosses: ["car", "vehicle"], note: null }], kanjiCharacters: ["車"], tags: ["transport"] },
  { id: "de-eki", headword: "駅", reading: "えき", romaji: "eki", jlptLevel: "N5", isCommon: true, frequencyRank: 290, partsOfSpeech: ["noun"], senses: [{ glosses: ["train station"], note: null }], kanjiCharacters: ["駅"], tags: ["transport", "places"] },
  { id: "de-ookii", headword: "大きい", reading: "おおきい", romaji: "ookii", jlptLevel: "N5", isCommon: true, frequencyRank: 160, partsOfSpeech: ["adjective", "i-adjective"], senses: [{ glosses: ["big", "large"], note: null }], kanjiCharacters: ["大"], tags: ["description"] },
  { id: "de-chiisai", headword: "小さい", reading: "ちいさい", romaji: "chiisai", jlptLevel: "N5", isCommon: true, frequencyRank: 165, partsOfSpeech: ["adjective", "i-adjective"], senses: [{ glosses: ["small", "little"], note: null }], kanjiCharacters: ["小"], tags: ["description"] },
  { id: "de-atarashii", headword: "新しい", reading: "あたらしい", romaji: "atarashii", jlptLevel: "N5", isCommon: true, frequencyRank: 200, partsOfSpeech: ["adjective", "i-adjective"], senses: [{ glosses: ["new", "fresh"], note: null }], kanjiCharacters: ["新"], tags: ["description"] },
  { id: "de-tomodachi", headword: "友達", reading: "ともだち", romaji: "tomodachi", jlptLevel: "N5", isCommon: true, frequencyRank: 270, partsOfSpeech: ["noun"], senses: [{ glosses: ["friend"], note: null }], kanjiCharacters: ["友", "達"], tags: ["people"] },
  { id: "de-mainichi", headword: "毎日", reading: "まいにち", romaji: "mainichi", jlptLevel: "N5", isCommon: true, frequencyRank: 190, partsOfSpeech: ["noun", "adverb"], senses: [{ glosses: ["every day", "daily"], note: null }], kanjiCharacters: ["毎", "日"], tags: ["time"] },
  { id: "de-densha", headword: "電車", reading: "でんしゃ", romaji: "densha", jlptLevel: "N5", isCommon: true, frequencyRank: 255, partsOfSpeech: ["noun"], senses: [{ glosses: ["train", "electric train"], note: null }], kanjiCharacters: ["電", "車"], tags: ["transport"] },
  { id: "de-gakkou", headword: "学校", reading: "がっこう", romaji: "gakkou", jlptLevel: "N5", isCommon: true, frequencyRank: 175, partsOfSpeech: ["noun"], senses: [{ glosses: ["school"], note: null }], kanjiCharacters: ["学", "校"], tags: ["school", "places"] },
  { id: "de-shokuji", headword: "食事", reading: "しょくじ", romaji: "shokuji", jlptLevel: "N4", isCommon: true, frequencyRank: 410, partsOfSpeech: ["noun", "suru-verb"], senses: [{ glosses: ["meal", "dining"], note: "食事をする means to have a meal." }], kanjiCharacters: ["食", "事"], tags: ["food"] },
  { id: "de-tegami", headword: "手紙", reading: "てがみ", romaji: "tegami", jlptLevel: "N5", isCommon: true, frequencyRank: 320, partsOfSpeech: ["noun"], senses: [{ glosses: ["letter", "written message"], note: null }], kanjiCharacters: ["手", "紙"], tags: ["communication"] },
  { id: "de-shinpai", headword: "心配", reading: "しんぱい", romaji: "shinpai", jlptLevel: "N4", isCommon: true, frequencyRank: 480, partsOfSpeech: ["noun", "na-adjective", "suru-verb"], senses: [{ glosses: ["worry", "anxiety", "concern"], note: "心配する = to worry." }], kanjiCharacters: ["心", "配"], tags: ["emotion"] },
  { id: "de-benkyou", headword: "勉強", reading: "べんきょう", romaji: "benkyou", jlptLevel: "N5", isCommon: true, frequencyRank: 205, partsOfSpeech: ["noun", "suru-verb"], senses: [{ glosses: ["study", "studying"], note: "勉強する = to study." }], kanjiCharacters: ["勉", "強"], tags: ["school"] },
  { id: "de-shigoto", headword: "仕事", reading: "しごと", romaji: "shigoto", jlptLevel: "N5", isCommon: true, frequencyRank: 195, partsOfSpeech: ["noun", "suru-verb"], senses: [{ glosses: ["work", "job", "occupation"], note: null }], kanjiCharacters: ["仕", "事"], tags: ["work"] },
];

export interface GrammarPatternDef {
  id: string;
  slug: string;
  title: string;
  structure: string;
  meaning: string;
  explanation: string;
  formation: string;
  jlptLevel: string;
  commonMistakes: string[];
  tags: string[];
}

export const GRAMMAR_PATTERNS: GrammarPatternDef[] = [
  {
    id: "gp-wa",
    slug: "wa-topic",
    title: "は (topic marker)",
    structure: "Noun + は + comment",
    meaning: "marks the topic: as for X, …",
    explanation:
      "は introduces what the sentence is about and frames the rest as a comment on it. The topic is often already known to both speakers, so は frequently carries a contrastive nuance (this one, as opposed to others).",
    formation: "Written は but pronounced wa when used as a particle.",
    jlptLevel: "N5",
    commonMistakes: [
      "Pronouncing the particle は as ha instead of wa.",
      "Using は when introducing brand-new information, where が is more natural.",
    ],
    tags: ["particle", "core"],
  },
  {
    id: "gp-ga",
    slug: "ga-subject",
    title: "が (subject marker)",
    structure: "Noun + が + predicate",
    meaning: "marks the grammatical subject, or new information",
    explanation:
      "が identifies who or what performs the action, and is used when the subject is new, being singled out, or answering a question word such as 誰が.",
    formation: "Attach が directly to the noun.",
    jlptLevel: "N5",
    commonMistakes: [
      "Using は in answers to question words; 誰が questions must be answered with が.",
      "Marking the object of 好き or 上手 with を instead of が.",
    ],
    tags: ["particle", "core"],
  },
  {
    id: "gp-wo",
    slug: "wo-object",
    title: "を (direct object marker)",
    structure: "Noun + を + transitive verb",
    meaning: "marks the direct object of an action",
    explanation:
      "を marks the thing directly affected by a transitive verb. It also marks the space traversed with motion verbs, as in 公園を歩く.",
    formation: "Written を, pronounced o.",
    jlptLevel: "N5",
    commonMistakes: [
      "Using を with intransitive verbs such as 行く for a destination; use に or へ.",
      "Writing the particle as お.",
    ],
    tags: ["particle", "core"],
  },
  {
    id: "gp-te-kara",
    slug: "te-kara",
    title: "〜てから",
    structure: "Verb て-form + から",
    meaning: "after doing X, then Y",
    explanation:
      "〜てから states that the second action happens only after the first is finished. It emphasises sequence more strongly than simply joining clauses with the て-form.",
    formation: "Convert the first verb to its て-form and add から.",
    jlptLevel: "N5",
    commonMistakes: [
      "Using the plain past (た) before から, which changes the meaning to because.",
      "Marking both clauses for tense; only the final verb carries tense.",
    ],
    tags: ["conjunction", "sequence"],
  },
  {
    id: "gp-te-iru",
    slug: "te-iru",
    title: "〜ている",
    structure: "Verb て-form + いる",
    meaning: "ongoing action, or a resulting state",
    explanation:
      "〜ている expresses an action in progress (本を読んでいる) or a state that continues after a change (結婚している). Which reading applies depends on the verb type.",
    formation: "て-form + いる; polite form is 〜ています.",
    jlptLevel: "N5",
    commonMistakes: [
      "Translating 知っている as I am knowing instead of I know.",
      "Dropping the い in writing; 〜てる is casual speech only.",
    ],
    tags: ["aspect", "core"],
  },
  {
    id: "gp-tai",
    slug: "tai",
    title: "〜たい",
    structure: "Verb ます-stem + たい",
    meaning: "want to do something",
    explanation:
      "〜たい expresses the speaker's own desire to act. The result conjugates like an い-adjective, and the object may take either を or が.",
    formation: "Remove ます from the polite form and add たい.",
    jlptLevel: "N5",
    commonMistakes: [
      "Using 〜たい to state a third person's desire; use 〜たがっている instead.",
      "Conjugating たい like a verb rather than an い-adjective.",
    ],
    tags: ["desire", "core"],
  },
  {
    id: "gp-naide-kudasai",
    slug: "naide-kudasai",
    title: "〜ないでください",
    structure: "Verb ない-form + でください",
    meaning: "please do not do something",
    explanation:
      "A polite negative request. Softer alternatives replace ください with もらえますか for extra politeness.",
    formation: "Take the ない-form and add でください.",
    jlptLevel: "N5",
    commonMistakes: [
      "Using the て-form instead of the ない-form.",
      "Adding を after the verb.",
    ],
    tags: ["request", "negative"],
  },
  {
    id: "gp-koto-ga-dekiru",
    slug: "koto-ga-dekiru",
    title: "〜ことができる",
    structure: "Verb dictionary form + ことができる",
    meaning: "can do, be able to do",
    explanation:
      "Expresses ability or permission in a slightly formal way. The shorter potential form of the verb carries the same meaning in conversation.",
    formation: "Dictionary form + ことができる.",
    jlptLevel: "N4",
    commonMistakes: [
      "Using the ます-stem instead of the dictionary form before こと.",
      "Marking こと with を instead of が.",
    ],
    tags: ["ability"],
  },
  {
    id: "gp-nakereba-naranai",
    slug: "nakereba-naranai",
    title: "〜なければならない",
    structure: "Verb ない-stem + なければならない",
    meaning: "must do, have to do",
    explanation:
      "States an obligation imposed by rules or circumstances. 〜なきゃ is the casual spoken contraction.",
    formation: "Replace ない with なければ and add ならない.",
    jlptLevel: "N4",
    commonMistakes: [
      "Forgetting that the phrase is a double negative and reversing the meaning.",
      "Mixing it with 〜なくてもいい, which means you do not have to.",
    ],
    tags: ["obligation"],
  },
  {
    id: "gp-ta-koto-ga-aru",
    slug: "ta-koto-ga-aru",
    title: "〜たことがある",
    structure: "Verb た-form + ことがある",
    meaning: "have done something before (experience)",
    explanation:
      "Describes life experience rather than a specific past event. For something that happened at a stated time, use the plain past instead.",
    formation: "Plain past form + ことがある.",
    jlptLevel: "N4",
    commonMistakes: [
      "Using it with a specific time expression such as 昨日.",
      "Using the dictionary form before ことがある, which means sometimes happens.",
    ],
    tags: ["experience"],
  },
  {
    id: "gp-hou-ga",
    slug: "hou-ga",
    title: "〜より〜のほうが",
    structure: "A より B のほうが + adjective",
    meaning: "B is more … than A",
    explanation:
      "Used to compare two items. より marks the standard of comparison and のほうが marks the item that scores higher.",
    formation: "Noun + より + noun + のほうが + adjective.",
    jlptLevel: "N5",
    commonMistakes: [
      "Reversing より and のほうが, which inverts the comparison.",
      "Adding のほうが to both items.",
    ],
    tags: ["comparison"],
  },
  {
    id: "gp-nagara",
    slug: "nagara",
    title: "〜ながら",
    structure: "Verb ます-stem + ながら",
    meaning: "while doing X, also do Y",
    explanation:
      "Marks two simultaneous actions by the same person. The main action is the one in the final clause.",
    formation: "Remove ます and add ながら.",
    jlptLevel: "N4",
    commonMistakes: [
      "Using ながら when the two actions have different subjects.",
      "Attaching ながら to the dictionary form.",
    ],
    tags: ["simultaneous"],
  },
];

export interface ExampleSentenceDef {
  id: string;
  japanese: string;
  reading: string;
  english: string;
  jlptLevel: string;
  grammarId: string | null;
  dictionaryEntryIds: string[];
  kanjiCharacters: string[];
  tags: string[];
}

export const EXAMPLE_SENTENCES: ExampleSentenceDef[] = [
  { id: "es-001", japanese: "私は毎日水を飲みます。", reading: "わたしはまいにちみずをのみます。", english: "I drink water every day.", jlptLevel: "N5", grammarId: "gp-wa", dictionaryEntryIds: ["de-mizu", "de-nomu", "de-mainichi"], kanjiCharacters: ["私", "毎", "日", "水", "飲"], tags: ["daily-life"] },
  { id: "es-002", japanese: "学生が教室で本を読んでいます。", reading: "がくせいがきょうしつでほんをよんでいます。", english: "A student is reading a book in the classroom.", jlptLevel: "N5", grammarId: "gp-te-iru", dictionaryEntryIds: ["de-gakusei", "de-hon", "de-yomu"], kanjiCharacters: ["学", "生", "教", "室", "本", "読"], tags: ["school"] },
  { id: "es-003", japanese: "ご飯を食べてから、薬を飲みます。", reading: "ごはんをたべてから、くすりをのみます。", english: "After eating, I take my medicine.", jlptLevel: "N5", grammarId: "gp-te-kara", dictionaryEntryIds: ["de-taberu", "de-nomu"], kanjiCharacters: ["飯", "食", "薬", "飲"], tags: ["sequence", "daily-life"] },
  { id: "es-004", japanese: "先生は日本語を話します。", reading: "せんせいはにほんごをはなします。", english: "The teacher speaks Japanese.", jlptLevel: "N5", grammarId: "gp-wa", dictionaryEntryIds: ["de-sensei", "de-hanasu", "de-nihon"], kanjiCharacters: ["先", "生", "日", "本", "語", "話"], tags: ["school"] },
  { id: "es-005", japanese: "この山はとても大きいです。", reading: "このやまはとてもおおきいです。", english: "This mountain is very big.", jlptLevel: "N5", grammarId: "gp-wa", dictionaryEntryIds: ["de-yama", "de-ookii"], kanjiCharacters: ["山", "大"], tags: ["nature", "description"] },
  { id: "es-006", japanese: "川で小さい魚を見ました。", reading: "かわでちいさいさかなをみました。", english: "I saw a small fish in the river.", jlptLevel: "N5", grammarId: "gp-wo", dictionaryEntryIds: ["de-kawa", "de-chiisai", "de-miru"], kanjiCharacters: ["川", "小", "魚", "見"], tags: ["nature"] },
  { id: "es-007", japanese: "友達と電車で駅まで行きました。", reading: "ともだちとでんしゃでえきまでいきました。", english: "I went to the station by train with a friend.", jlptLevel: "N5", grammarId: null, dictionaryEntryIds: ["de-tomodachi", "de-densha", "de-eki", "de-iku"], kanjiCharacters: ["友", "達", "電", "車", "駅", "行"], tags: ["transport"] },
  { id: "es-008", japanese: "新しい車が欲しいです。", reading: "あたらしいくるまがほしいです。", english: "I want a new car.", jlptLevel: "N5", grammarId: "gp-ga", dictionaryEntryIds: ["de-atarashii", "de-kuruma"], kanjiCharacters: ["新", "車", "欲"], tags: ["desire", "transport"] },
  { id: "es-009", japanese: "日本へ行きたいです。", reading: "にほんへいきたいです。", english: "I want to go to Japan.", jlptLevel: "N5", grammarId: "gp-tai", dictionaryEntryIds: ["de-nihon", "de-iku"], kanjiCharacters: ["日", "本", "行"], tags: ["desire", "travel"] },
  { id: "es-010", japanese: "ここで写真を撮らないでください。", reading: "ここでしゃしんをとらないでください。", english: "Please do not take photographs here.", jlptLevel: "N5", grammarId: "gp-naide-kudasai", dictionaryEntryIds: [], kanjiCharacters: ["写", "真", "撮"], tags: ["request"] },
  { id: "es-011", japanese: "私は漢字を書くことができます。", reading: "わたしはかんじをかくことができます。", english: "I can write kanji.", jlptLevel: "N4", grammarId: "gp-koto-ga-dekiru", dictionaryEntryIds: ["de-kaku"], kanjiCharacters: ["私", "漢", "字", "書"], tags: ["ability", "school"] },
  { id: "es-012", japanese: "明日までに手紙を書かなければなりません。", reading: "あしたまでにてがみをかかなければなりません。", english: "I have to write the letter by tomorrow.", jlptLevel: "N4", grammarId: "gp-nakereba-naranai", dictionaryEntryIds: ["de-tegami", "de-kaku"], kanjiCharacters: ["明", "日", "手", "紙", "書"], tags: ["obligation"] },
  { id: "es-013", japanese: "日本の映画を見たことがあります。", reading: "にほんのえいがをみたことがあります。", english: "I have watched a Japanese film before.", jlptLevel: "N4", grammarId: "gp-ta-koto-ga-aru", dictionaryEntryIds: ["de-nihon", "de-miru"], kanjiCharacters: ["日", "本", "映", "画", "見"], tags: ["experience"] },
  { id: "es-014", japanese: "電車より車のほうが速いです。", reading: "でんしゃよりくるまのほうがはやいです。", english: "A car is faster than a train.", jlptLevel: "N5", grammarId: "gp-hou-ga", dictionaryEntryIds: ["de-densha", "de-kuruma"], kanjiCharacters: ["電", "車", "速"], tags: ["comparison", "transport"] },
  { id: "es-015", japanese: "音楽を聞きながら勉強します。", reading: "おんがくをききながらべんきょうします。", english: "I study while listening to music.", jlptLevel: "N4", grammarId: "gp-nagara", dictionaryEntryIds: ["de-kiku", "de-benkyou"], kanjiCharacters: ["音", "楽", "聞", "勉", "強"], tags: ["simultaneous", "school"] },
  { id: "es-016", japanese: "学校まで歩いて行きます。", reading: "がっこうまであるいていきます。", english: "I walk to school.", jlptLevel: "N5", grammarId: null, dictionaryEntryIds: ["de-gakkou", "de-iku"], kanjiCharacters: ["学", "校", "歩", "行"], tags: ["school", "movement"] },
  { id: "es-017", japanese: "時間がないので、急ぎましょう。", reading: "じかんがないので、いそぎましょう。", english: "We have no time, so let's hurry.", jlptLevel: "N4", grammarId: "gp-ga", dictionaryEntryIds: ["de-jikan"], kanjiCharacters: ["時", "間", "急"], tags: ["time"] },
  { id: "es-018", japanese: "毎日の食事は大切です。", reading: "まいにちのしょくじはたいせつです。", english: "Daily meals are important.", jlptLevel: "N4", grammarId: "gp-wa", dictionaryEntryIds: ["de-mainichi", "de-shokuji"], kanjiCharacters: ["毎", "日", "食", "事", "大", "切"], tags: ["food", "health"] },
  { id: "es-019", japanese: "心配しないでください。", reading: "しんぱいしないでください。", english: "Please do not worry.", jlptLevel: "N4", grammarId: "gp-naide-kudasai", dictionaryEntryIds: ["de-shinpai"], kanjiCharacters: ["心", "配"], tags: ["emotion", "request"] },
  { id: "es-020", japanese: "父は仕事で東京に行っています。", reading: "ちちはしごとでとうきょうにいっています。", english: "My father has gone to Tokyo for work.", jlptLevel: "N4", grammarId: "gp-te-iru", dictionaryEntryIds: ["de-shigoto", "de-iku"], kanjiCharacters: ["父", "仕", "事", "東", "京", "行"], tags: ["work", "family"] },
  { id: "es-021", japanese: "水を飲んでから、走ります。", reading: "みずをのんでから、はしります。", english: "I run after drinking water.", jlptLevel: "N5", grammarId: "gp-te-kara", dictionaryEntryIds: ["de-mizu", "de-nomu"], kanjiCharacters: ["水", "飲", "走"], tags: ["sequence", "sport"] },
  { id: "es-022", japanese: "その本は友達が読んでいます。", reading: "そのほんはともだちがよんでいます。", english: "My friend is reading that book.", jlptLevel: "N5", grammarId: "gp-ga", dictionaryEntryIds: ["de-hon", "de-tomodachi", "de-yomu"], kanjiCharacters: ["本", "友", "達", "読"], tags: ["daily-life"] },
  { id: "es-023", japanese: "先生に質問を聞きました。", reading: "せんせいにしつもんをききました。", english: "I asked the teacher a question.", jlptLevel: "N5", grammarId: "gp-wo", dictionaryEntryIds: ["de-sensei", "de-kiku"], kanjiCharacters: ["先", "生", "質", "問", "聞"], tags: ["school", "communication"] },
  { id: "es-024", japanese: "小さい川の水はきれいです。", reading: "ちいさいかわのみずはきれいです。", english: "The water of the small river is clean.", jlptLevel: "N5", grammarId: "gp-wa", dictionaryEntryIds: ["de-chiisai", "de-kawa", "de-mizu"], kanjiCharacters: ["小", "川", "水"], tags: ["nature"] },
];
