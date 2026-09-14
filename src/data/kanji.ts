/**
 * First-party kanji decomposition data for the Mind Tree.
 *
 * Provenance: authored in-repository. Stroke counts, readings and meanings are
 * standard, non-copyrightable language facts. Elements include classical
 * radicals AND "primitive" building-block characters (寺, 者, 每 …), because a
 * kanji's meaningful parts are often whole characters — this is what makes the
 * family graph useful for learners.
 */

export const KANJI_SOURCE_REF = "first-party:kanji-mindtree:v1";

export type ElementCategory = "radical" | "primitive";
export type ElementRole = "semantic" | "phonetic" | "positional" | "structural";

export interface ElementDef {
  id: string;
  character: string;
  altForms: string[];
  meaning: string;
  readingKun: string | null;
  readingOn: string | null;
  strokeCount: number;
  kangxiNumber: number | null;
  category: ElementCategory;
  typicalRole: ElementRole;
  mnemonic: string | null;
}

export const ELEMENTS: ElementDef[] = [
  { id: "el-mizu", character: "水", altForms: ["氵", "氺"], meaning: "water", readingKun: "みず", readingOn: "スイ", strokeCount: 4, kangxiNumber: 85, category: "radical", typicalRole: "semantic", mnemonic: "Three water droplets splashing off a central stream." },
  { id: "el-hito", character: "人", altForms: ["亻"], meaning: "person", readingKun: "ひと", readingOn: "ジン、ニン", strokeCount: 2, kangxiNumber: 9, category: "radical", typicalRole: "semantic", mnemonic: "A person mid-stride, legs apart." },
  { id: "el-ki", character: "木", altForms: [], meaning: "tree, wood", readingKun: "き", readingOn: "モク、ボク", strokeCount: 4, kangxiNumber: 75, category: "radical", typicalRole: "semantic", mnemonic: "A tree with branches above and roots below." },
  { id: "el-hi", character: "火", altForms: ["灬"], meaning: "fire", readingKun: "ひ", readingOn: "カ", strokeCount: 4, kangxiNumber: 86, category: "radical", typicalRole: "semantic", mnemonic: "A campfire with sparks flying up." },
  { id: "el-kuchi", character: "口", altForms: [], meaning: "mouth", readingKun: "くち", readingOn: "コウ", strokeCount: 3, kangxiNumber: 30, category: "radical", typicalRole: "semantic", mnemonic: "An open square mouth." },
  { id: "el-kokoro", character: "心", altForms: ["忄"], meaning: "heart, mind", readingKun: "こころ", readingOn: "シン", strokeCount: 4, kangxiNumber: 61, category: "radical", typicalRole: "semantic", mnemonic: "A heart with three beats." },
  { id: "el-te", character: "手", altForms: ["扌"], meaning: "hand", readingKun: "て", readingOn: "シュ", strokeCount: 4, kangxiNumber: 64, category: "radical", typicalRole: "semantic", mnemonic: "Four fingers gripping a wrist." },
  { id: "el-hi2", character: "日", altForms: [], meaning: "sun, day", readingKun: "ひ", readingOn: "ジツ、ニチ", strokeCount: 4, kangxiNumber: 72, category: "radical", typicalRole: "semantic", mnemonic: "The sun with a mark at its centre." },
  { id: "el-tsuki", character: "月", altForms: [], meaning: "moon, month", readingKun: "つき", readingOn: "ゲツ、ガツ", strokeCount: 4, kangxiNumber: 130, category: "radical", typicalRole: "semantic", mnemonic: "A crescent moon with a cloud." },
  { id: "el-kane", character: "金", altForms: ["釒"], meaning: "metal, gold", readingKun: "かね", readingOn: "キン", strokeCount: 8, kangxiNumber: 167, category: "radical", typicalRole: "semantic", mnemonic: "A nugget with two ingots beneath a roof." },
  { id: "el-ito", character: "糸", altForms: [], meaning: "thread", readingKun: "いと", readingOn: "シ", strokeCount: 6, kangxiNumber: 120, category: "radical", typicalRole: "semantic", mnemonic: "A skein of silk with a fringe below." },
  { id: "el-gen", character: "言", altForms: ["訁"], meaning: "speech, say", readingKun: "い(う)", readingOn: "ゲン、ゴン", strokeCount: 7, kangxiNumber: 149, category: "radical", typicalRole: "semantic", mnemonic: "Words stacked above a mouth." },
  { id: "el-ame", character: "雨", altForms: [], meaning: "rain", readingKun: "あめ", readingOn: "ウ", strokeCount: 8, kangxiNumber: 173, category: "radical", typicalRole: "semantic", mnemonic: "A cloud shedding four drops." },
  { id: "el-yama", character: "山", altForms: [], meaning: "mountain", readingKun: "やま", readingOn: "サン", strokeCount: 3, kangxiNumber: 46, category: "radical", typicalRole: "semantic", mnemonic: "Three peaks in a row." },
  { id: "el-kawa", character: "川", altForms: [], meaning: "river", readingKun: "かわ", readingOn: "セン", strokeCount: 3, kangxiNumber: 47, category: "radical", typicalRole: "semantic", mnemonic: "Three flowing streams." },
  { id: "el-ta", character: "田", altForms: [], meaning: "rice field", readingKun: "た", readingOn: "デン", strokeCount: 5, kangxiNumber: 102, category: "radical", typicalRole: "semantic", mnemonic: "Paddies divided into four plots." },
  { id: "el-onna", character: "女", altForms: [], meaning: "woman", readingKun: "おんな", readingOn: "ジョ、ニョ", strokeCount: 3, kangxiNumber: 38, category: "radical", typicalRole: "semantic", mnemonic: "A figure kneeling with crossed arms." },
  { id: "el-ko", character: "子", altForms: [], meaning: "child", readingKun: "こ", readingOn: "シ、ス", strokeCount: 3, kangxiNumber: 39, category: "radical", typicalRole: "semantic", mnemonic: "A swaddled infant with outstretched arms." },
  { id: "el-oo", character: "大", altForms: [], meaning: "big", readingKun: "おお(きい)", readingOn: "ダイ、タイ", strokeCount: 3, kangxiNumber: 37, category: "radical", typicalRole: "semantic", mnemonic: "A person stretching wide to look big." },
  { id: "el-tatsu", character: "立", altForms: [], meaning: "stand", readingKun: "た(つ)", readingOn: "リツ", strokeCount: 5, kangxiNumber: 117, category: "radical", typicalRole: "semantic", mnemonic: "A figure standing firmly on the ground." },
  { id: "el-kake", character: "走", altForms: [], meaning: "run", readingKun: "はし(る)", readingOn: "ソウ", strokeCount: 7, kangxiNumber: 156, category: "radical", typicalRole: "semantic", mnemonic: "A foot kicking up soil as it runs." },
  { id: "el-kuruma", character: "車", altForms: [], meaning: "car, wheel", readingKun: "くるま", readingOn: "シャ", strokeCount: 7, kangxiNumber: 159, category: "radical", typicalRole: "semantic", mnemonic: "A cart seen from above, axle through the middle." },
  { id: "el-mon", character: "門", altForms: [], meaning: "gate", readingKun: "かど", readingOn: "モン", strokeCount: 8, kangxiNumber: 169, category: "radical", typicalRole: "positional", mnemonic: "Twin gate posts facing each other." },
  { id: "el-ukinben", character: "宀", altForms: [], meaning: "roof", readingKun: null, readingOn: null, strokeCount: 3, kangxiNumber: 40, category: "radical", typicalRole: "positional", mnemonic: "A crown-shaped roof sheltering what is below." },
  { id: "el-madare", character: "广", altForms: [], meaning: "dotted cliff", readingKun: null, readingOn: null, strokeCount: 3, kangxiNumber: 53, category: "radical", typicalRole: "positional", mnemonic: "A cliff overhang offering shade." },
  { id: "el-take", character: "竹", altForms: ["⺮"], meaning: "bamboo", readingKun: "たけ", readingOn: "チク", strokeCount: 6, kangxiNumber: 118, category: "radical", typicalRole: "semantic", mnemonic: "Two paired bamboo stalks with drooping leaves." },
  { id: "el-ishi", character: "石", altForms: [], meaning: "stone", readingKun: "いし", readingOn: "セキ、シャク", strokeCount: 5, kangxiNumber: 112, category: "radical", typicalRole: "semantic", mnemonic: "A boulder resting under a cliff." },
  { id: "el-tsuchi", character: "土", altForms: [], meaning: "earth, soil", readingKun: "つち", readingOn: "ド、ト", strokeCount: 3, kangxiNumber: 32, category: "radical", typicalRole: "semantic", mnemonic: "Soil piled up above the ground line." },
  { id: "el-chikara", character: "力", altForms: [], meaning: "power, strength", readingKun: "ちから", readingOn: "リキ、リョク", strokeCount: 2, kangxiNumber: 19, category: "radical", typicalRole: "semantic", mnemonic: "A flexed arm showing force." },
  { id: "el-shiro", character: "白", altForms: [], meaning: "white", readingKun: "しろ", readingOn: "ハク、ビャク", strokeCount: 5, kangxiNumber: 106, category: "radical", typicalRole: "semantic", mnemonic: "Sunlight rendered as pure white." },
  { id: "el-me", character: "目", altForms: [], meaning: "eye", readingKun: "め", readingOn: "モク", strokeCount: 5, kangxiNumber: 109, category: "radical", typicalRole: "semantic", mnemonic: "An eye drawn as a horizontal slit with a pupil." },
  { id: "el-mimi", character: "耳", altForms: [], meaning: "ear", readingKun: "みみ", readingOn: "ジ", strokeCount: 6, kangxiNumber: 128, category: "radical", typicalRole: "semantic", mnemonic: "The curve of an outer ear." },
  { id: "el-ashi", character: "足", altForms: ["⻊"], meaning: "foot, leg", readingKun: "あし", readingOn: "ソク", strokeCount: 7, kangxiNumber: 157, category: "radical", typicalRole: "semantic", mnemonic: "A knee above a foot and toes." },
  { id: "el-shoku", character: "食", altForms: ["飠"], meaning: "eat, food", readingKun: "た(べる)", readingOn: "ショク", strokeCount: 9, kangxiNumber: 184, category: "radical", typicalRole: "semantic", mnemonic: "A covered rice vessel." },
  { id: "el-kai", character: "貝", altForms: ["⻉"], meaning: "shellfish", readingKun: "かい", readingOn: "バイ", strokeCount: 7, kangxiNumber: 154, category: "radical", typicalRole: "semantic", mnemonic: "A cowrie shell — once used as money." },
  { id: "el-kusakanmuri", character: "艹", altForms: ["艸"], meaning: "grass, plants", readingKun: "くさ", readingOn: "ソウ", strokeCount: 3, kangxiNumber: 140, category: "radical", typicalRole: "semantic", mnemonic: "Two sprouting leaves atop a plant." },
  { id: "el-gyouninben", character: "彳", altForms: [], meaning: "step, walking", readingKun: null, readingOn: null, strokeCount: 3, kangxiNumber: 60, category: "radical", typicalRole: "semantic", mnemonic: "Half of 行 — a single footstep." },
  { id: "el-amime", character: "罒", altForms: ["网"], meaning: "net", readingKun: null, readingOn: null, strokeCount: 5, kangxiNumber: 122, category: "radical", typicalRole: "semantic", mnemonic: "A net stretched across a frame." },
  { id: "el-eki", character: "疋", altForms: ["⺛"], meaning: "bolt of cloth", readingKun: null, readingOn: null, strokeCount: 5, kangxiNumber: 103, category: "radical", typicalRole: "semantic", mnemonic: "A rolled bolt of fabric with a trailing end." },
  { id: "el-kei", character: "彐", altForms: [], meaning: "snout, pig head", readingKun: null, readingOn: null, strokeCount: 3, kangxiNumber: 58, category: "radical", typicalRole: "semantic", mnemonic: "A snout with a swept-back ear." },
  { id: "el-hizanashi", character: "儿", altForms: [], meaning: "legs", readingKun: null, readingOn: null, strokeCount: 2, kangxiNumber: 10, category: "radical", typicalRole: "structural", mnemonic: "Two dangling legs beneath a body." },

  /* ---- Primitives: whole characters reused as building blocks ---- */
  { id: "el-tera", character: "寺", altForms: [], meaning: "temple", readingKun: "てら", readingOn: "ジ", strokeCount: 6, kangxiNumber: null, category: "primitive", typicalRole: "phonetic", mnemonic: "Levels of a pagoda over a marker." },
  { id: "el-mono", character: "者", altForms: [], meaning: "person, someone", readingKun: "もの", readingOn: "シャ", strokeCount: 8, kangxiNumber: null, category: "primitive", typicalRole: "phonetic", mnemonic: "An elder with a wrinkled face over 日." },
  { id: "el-itaru", character: "至", altForms: [], meaning: "arrive, climax", readingKun: "いた(る)", readingOn: "シ", strokeCount: 6, kangxiNumber: null, category: "primitive", typicalRole: "phonetic", mnemonic: "An arrow hitting the ground — you have arrived." },
  { id: "el-mesu", character: "召", altForms: [], meaning: "summon", readingKun: "め(す)", readingOn: "ショウ", strokeCount: 5, kangxiNumber: null, category: "primitive", typicalRole: "phonetic", mnemonic: "A blade calling out above a mouth." },
  { id: "el-hosu", character: "干", altForms: [], meaning: "dry", readingKun: "ほ(す)", readingOn: "カン", strokeCount: 3, kangxiNumber: null, category: "primitive", typicalRole: "phonetic", mnemonic: "A drying pole with two crossbars." },
  { id: "el-chou", character: "丁", altForms: [], meaning: "street, block", readingKun: null, readingOn: "チョウ、テイ", strokeCount: 2, kangxiNumber: null, category: "primitive", typicalRole: "phonetic", mnemonic: "A nail head atop a bent shaft." },
  { id: "el-ka", character: "化", altForms: [], meaning: "change", readingKun: "ば(ける)", readingOn: "カ、ケ", strokeCount: 4, kangxiNumber: null, category: "primitive", typicalRole: "phonetic", mnemonic: "A person standing beside a transformed figure." },
  { id: "el-go", character: "五", altForms: [], meaning: "five", readingKun: "いつ(つ)", readingOn: "ゴ", strokeCount: 4, kangxiNumber: null, category: "primitive", typicalRole: "phonetic", mnemonic: "Five tally strokes bound into one glyph." },
  { id: "el-mai", character: "每", altForms: [], meaning: "every", readingKun: null, readingOn: "マイ", strokeCount: 7, kangxiNumber: null, category: "primitive", typicalRole: "phonetic", mnemonic: "A mother (母) with a tally mark each day." },
  { id: "el-mizukara", character: "自", altForms: [], meaning: "self", readingKun: "みずか(ら)", readingOn: "ジ、シ", strokeCount: 6, kangxiNumber: null, category: "primitive", typicalRole: "semantic", mnemonic: "A nose — pointing at your own face means 'me'." },
  { id: "el-mata", character: "又", altForms: [], meaning: "again", readingKun: "また", readingOn: "", strokeCount: 2, kangxiNumber: null, category: "primitive", typicalRole: "semantic", mnemonic: "A right hand reaching out once more." },
  { id: "el-ue", character: "上", altForms: [], meaning: "up, above", readingKun: "うえ", readingOn: "ジョウ", strokeCount: 3, kangxiNumber: null, category: "primitive", typicalRole: "semantic", mnemonic: "A line with a marker rising above it." },
  { id: "el-shita", character: "下", altForms: [], meaning: "down, below", readingKun: "した", readingOn: "カ、ゲ", strokeCount: 3, kangxiNumber: null, category: "primitive", typicalRole: "semantic", mnemonic: "A marker hanging beneath a line." },
];

export interface KanjiDef {
  id: string;
  character: string;
  meaning: string;
  readingsKun: string[];
  readingsOn: string[];
  strokeCount: number;
  jlptLevel: string;
  gradeLevel: number | null;
  primaryRadicalId: string;
  mnemonic: string | null;
  vocabulary: Array<{ word: string; reading: string; meaning: string }>;
}

export const KANJI: KanjiDef[] = [
  { id: "kj-mei", character: "明", meaning: "bright, clear", readingsKun: ["あか(い)", "あき(らか)"], readingsOn: ["メイ"], strokeCount: 8, jlptLevel: "N5", gradeLevel: 2, primaryRadicalId: "el-hi2", mnemonic: "A sun and a moon side by side make the brightest thing there is.", vocabulary: [{ word: "明日", reading: "あした", meaning: "tomorrow" }, { word: "明るい", reading: "あかるい", meaning: "bright, cheerful" }] },
  { id: "kj-yasumu", character: "休", meaning: "rest, take a break", readingsKun: ["やす(む)", "やす(み)"], readingsOn: ["キュウ"], strokeCount: 6, jlptLevel: "N5", gradeLevel: 1, primaryRadicalId: "el-hito", mnemonic: "A person leaning against a tree to rest.", vocabulary: [{ word: "休み", reading: "やすみ", meaning: "rest, holiday" }, { word: "休憩", reading: "きゅうけい", meaning: "break, recess" }] },
  { id: "kj-hayashi", character: "林", meaning: "woods, grove", readingsKun: ["はやし"], readingsOn: ["リン"], strokeCount: 8, jlptLevel: "N5", gradeLevel: 2, primaryRadicalId: "el-ki", mnemonic: "Two trees standing together make a grove.", vocabulary: [{ word: "林", reading: "はやし", meaning: "woods" }, { word: "林道", reading: "りんどう", meaning: "forest road" }] },
  { id: "kj-mori", character: "森", meaning: "forest", readingsKun: ["もり"], readingsOn: ["シン"], strokeCount: 12, jlptLevel: "N5", gradeLevel: 1, primaryRadicalId: "el-ki", mnemonic: "Three trees crowd together into a dense forest.", vocabulary: [{ word: "森林", reading: "しんりん", meaning: "forest, woodland" }] },
  { id: "kj-suki", character: "好", meaning: "like, fond of", readingsKun: ["す(き)", "この(む)"], readingsOn: ["コウ"], strokeCount: 6, jlptLevel: "N4", gradeLevel: 4, primaryRadicalId: "el-onna", mnemonic: "A woman and her child together — what she likes best.", vocabulary: [{ word: "好き", reading: "すき", meaning: "liking, fondness" }, { word: "好感", reading: "こうかん", meaning: "good feeling" }] },
  { id: "kj-otoko", character: "男", meaning: "man, male", readingsKun: ["おとこ"], readingsOn: ["ダン", "ナン"], strokeCount: 7, jlptLevel: "N5", gradeLevel: 1, primaryRadicalId: "el-ta", mnemonic: "Strength (力) working the rice field (田) — historically the man's role.", vocabulary: [{ word: "男の人", reading: "おとこのひと", meaning: "man" }, { word: "男性", reading: "だんせい", meaning: "male" }] },
  { id: "kj-hana", character: "花", meaning: "flower", readingsKun: ["はな"], readingsOn: ["カ"], strokeCount: 7, jlptLevel: "N5", gradeLevel: 1, primaryRadicalId: "el-kusakanmuri", mnemonic: "A plant (艹) that transforms (化) into a flower.", vocabulary: [{ word: "花見", reading: "はなみ", meaning: "cherry-blossom viewing" }, { word: "花束", reading: "はなたば", meaning: "bouquet" }] },
  { id: "kj-cha", character: "茶", meaning: "tea", readingsKun: [], readingsOn: ["チャ", "サ"], strokeCount: 9, jlptLevel: "N4", gradeLevel: 2, primaryRadicalId: "el-kusakanmuri", mnemonic: "A person (人) standing among plants (艹) and trees (木) picking tea leaves.", vocabulary: [{ word: "お茶", reading: "おちゃ", meaning: "tea" }, { word: "茶道", reading: "さどう", meaning: "tea ceremony" }] },
  { id: "kj-go", character: "語", meaning: "language, speak", readingsKun: ["かた(る)", "かた(らす)"], readingsOn: ["ゴ"], strokeCount: 14, jlptLevel: "N5", gradeLevel: 2, primaryRadicalId: "el-gen", mnemonic: "Words (言) about five (五) things from the mouth (口).", vocabulary: [{ word: "日本語", reading: "にほんご", meaning: "Japanese language" }, { word: "言葉", reading: "ことば", meaning: "word, language" }] },
  { id: "kj-kiku", character: "聞", meaning: "hear, listen", readingsKun: ["き(く)", "き(こえる)"], readingsOn: ["ブン"], strokeCount: 14, jlptLevel: "N5", gradeLevel: 2, primaryRadicalId: "el-mon", mnemonic: "An ear (耳) pressed to the gate (門) to hear inside.", vocabulary: [{ word: "聞く", reading: "きく", meaning: "to hear, ask" }, { word: "新聞", reading: "しんぶん", meaning: "newspaper" }] },
  { id: "kj-toki", character: "時", meaning: "time, hour", readingsKun: ["とき"], readingsOn: ["ジ"], strokeCount: 10, jlptLevel: "N5", gradeLevel: 2, primaryRadicalId: "el-hi2", mnemonic: "The sun (日) over the temple (寺) marks the hours — 寺 gives the ジ sound.", vocabulary: [{ word: "時間", reading: "じかん", meaning: "time, hour" }, { word: "時々", reading: "ときどき", meaning: "sometimes" }] },
  { id: "kj-aida", character: "間", meaning: "interval, between", readingsKun: ["あい(だ)", "ま"], readingsOn: ["カン", "ケン"], strokeCount: 12, jlptLevel: "N5", gradeLevel: 2, primaryRadicalId: "el-mon", mnemonic: "Sunlight (日) streaming through the gap in a gate (門).", vocabulary: [{ word: "間", reading: "あいだ", meaning: "between, space" }, { word: "人間", reading: "にんげん", meaning: "human being" }] },
  { id: "kj-yuki", character: "雪", meaning: "snow", readingsKun: ["ゆき"], readingsOn: ["セツ"], strokeCount: 11, jlptLevel: "N4", gradeLevel: 2, primaryRadicalId: "el-ame", mnemonic: "Rain (雨) that falls as frozen crystals (彐).", vocabulary: [{ word: "雪", reading: "ゆき", meaning: "snow" }, { word: "大雪", reading: "おおゆき", meaning: "heavy snow" }] },
  { id: "kj-den", character: "電", meaning: "electricity", readingsKun: [], readingsOn: ["デン"], strokeCount: 13, jlptLevel: "N5", gradeLevel: 2, primaryRadicalId: "el-ame", mnemonic: "Lightning (雨) striking a rice field (田) — electricity.", vocabulary: [{ word: "電車", reading: "でんしゃ", meaning: "train" }, { word: "電話", reading: "でんわ", meaning: "telephone" }] },
  { id: "kj-umi", character: "海", meaning: "sea, ocean", readingsKun: ["うみ"], readingsOn: ["カイ"], strokeCount: 9, jlptLevel: "N5", gradeLevel: 2, primaryRadicalId: "el-mizu", mnemonic: "Water (氵) that is 'every' (每) where — the sea. 每 gives the カイ sound.", vocabulary: [{ word: "海", reading: "うみ", meaning: "sea" }, { word: "海外", reading: "かいがい", meaning: "overseas" }] },
  { id: "kj-arau", character: "洗", meaning: "wash", readingsKun: ["あら(う)"], readingsOn: ["セン"], strokeCount: 9, jlptLevel: "N3", gradeLevel: 6, primaryRadicalId: "el-mizu", mnemonic: "Washing with water (氵) before (先) something else — 先 gives セン.", vocabulary: [{ word: "洗う", reading: "あらう", meaning: "to wash" }, { word: "洗濯", reading: "せんたく", meaning: "laundry" }] },
  { id: "kj-ase", character: "汗", meaning: "sweat", readingsKun: ["あせ"], readingsOn: ["カン"], strokeCount: 6, jlptLevel: "N2", gradeLevel: null, primaryRadicalId: "el-mizu", mnemonic: "Water (氵) drying (干) off your skin is sweat.", vocabulary: [{ word: "汗", reading: "あせ", meaning: "sweat" }, { word: "汗をかく", reading: "あせをかく", meaning: "to perspire" }] },
  { id: "kj-akari", character: "灯", meaning: "lamp, light", readingsKun: ["ひ", "あかり"], readingsOn: ["トウ"], strokeCount: 6, jlptLevel: "N2", gradeLevel: null, primaryRadicalId: "el-hi", mnemonic: "Fire (火) on a small post (丁) is a lamp.", vocabulary: [{ word: "電灯", reading: "でんとう", meaning: "electric lamp" }, { word: "灯台", reading: "とうだい", meaning: "lighthouse" }] },
  { id: "kj-motsu", character: "持", meaning: "hold, have", readingsKun: ["も(つ)"], readingsOn: ["ジ"], strokeCount: 9, jlptLevel: "N4", gradeLevel: 3, primaryRadicalId: "el-te", mnemonic: "A hand (扌) holding a temple (寺) token — 寺 gives ジ.", vocabulary: [{ word: "持つ", reading: "もつ", meaning: "to hold, carry" }, { word: "気持ち", reading: "きもち", meaning: "feeling" }] },
  { id: "kj-maneku", character: "招", meaning: "beckon, invite", readingsKun: ["まね(く)"], readingsOn: ["ショウ"], strokeCount: 8, jlptLevel: "N1", gradeLevel: null, primaryRadicalId: "el-te", mnemonic: "A hand (扌) summoning (召) someone over.", vocabulary: [{ word: "招待", reading: "しょうたい", meaning: "invitation" }, { word: "招く", reading: "まねく", meaning: "to beckon, invite" }] },
  { id: "kj-iki", character: "息", meaning: "breath, son", readingsKun: ["いき"], readingsOn: ["ソク"], strokeCount: 10, jlptLevel: "N3", gradeLevel: 3, primaryRadicalId: "el-mizukara", mnemonic: "One's own (自) heart (心) beating with each breath.", vocabulary: [{ word: "息", reading: "いき", meaning: "breath" }, { word: "息子", reading: "むすこ", meaning: "son" }] },
  { id: "kj-toru", character: "取", meaning: "take, get", readingsKun: ["と(る)"], readingsOn: ["シュ"], strokeCount: 8, jlptLevel: "N3", gradeLevel: 4, primaryRadicalId: "el-mimi", mnemonic: "A hand (又) taking something by the ear (耳).", vocabulary: [{ word: "取る", reading: "とる", meaning: "to take" }, { word: "写真を取る", reading: "しゃしんをとる", meaning: "to take a photo" }] },
  { id: "kj-miru", character: "見", meaning: "see, look", readingsKun: ["み(る)", "み(える)"], readingsOn: ["ケン"], strokeCount: 7, jlptLevel: "N5", gradeLevel: 1, primaryRadicalId: "el-me", mnemonic: "An eye (目) on legs (儿) that wander around looking.", vocabulary: [{ word: "見る", reading: "みる", meaning: "to see, watch" }, { word: "意見", reading: "いけん", meaning: "opinion" }] },
  { id: "kj-hashiru", character: "走", meaning: "run", readingsKun: ["はし(る)"], readingsOn: ["ソウ"], strokeCount: 7, jlptLevel: "N4", gradeLevel: 2, primaryRadicalId: "el-tsuchi", mnemonic: "Feet kicking up soil (土) while running on a bolt of cloth (疋) track.", vocabulary: [{ word: "走る", reading: "はしる", meaning: "to run" }, { word: "競走", reading: "きょうそう", meaning: "race" }] },
  { id: "kj-matsu", character: "待", meaning: "wait", readingsKun: ["ま(つ)"], readingsOn: ["タイ"], strokeCount: 9, jlptLevel: "N4", gradeLevel: 3, primaryRadicalId: "el-gyouninben", mnemonic: "Walking (彳) to the temple (寺) and stopping to wait.", vocabulary: [{ word: "待つ", reading: "まつ", meaning: "to wait" }, { word: "待合室", reading: "まちあいしつ", meaning: "waiting room" }] },
  { id: "kj-ji", character: "字", meaning: "character, letter", readingsKun: ["あざ"], readingsOn: ["ジ"], strokeCount: 6, jlptLevel: "N5", gradeLevel: 1, primaryRadicalId: "el-ukinben", mnemonic: "A child (子) learning characters under a roof (宀).", vocabulary: [{ word: "文字", reading: "もじ", meaning: "letter, character" }, { word: "名字", reading: "みょうじ", meaning: "family name" }] },
  { id: "kj-yasui", character: "安", meaning: "cheap, peaceful", readingsKun: ["やす(い)"], readingsOn: ["アン"], strokeCount: 6, jlptLevel: "N5", gradeLevel: 3, primaryRadicalId: "el-ukinben", mnemonic: "A woman (女) safely at home under a roof (宀).", vocabulary: [{ word: "安い", reading: "やすい", meaning: "cheap" }, { word: "安全", reading: "あんぜん", meaning: "safety" }] },
  { id: "kj-shitsu", character: "室", meaning: "room", readingsKun: ["むろ"], readingsOn: ["シツ"], strokeCount: 9, jlptLevel: "N4", gradeLevel: 3, primaryRadicalId: "el-ukinben", mnemonic: "A roof (宀) over the place you arrive (至) — a room.", vocabulary: [{ word: "教室", reading: "きょうしつ", meaning: "classroom" }, { word: "研究室", reading: "けんきゅうしつ", meaning: "lab, seminar room" }] },
  { id: "kj-hako", character: "箱", meaning: "box", readingsKun: ["はこ"], readingsOn: ["ソウ"], strokeCount: 15, jlptLevel: "N3", gradeLevel: null, primaryRadicalId: "el-take", mnemonic: "A bamboo (竹) box holding wood (木) you can see (目).", vocabulary: [{ word: "箱", reading: "はこ", meaning: "box" }, { word: "ゴミ箱", reading: "ごみばこ", meaning: "rubbish bin" }] },
  { id: "kj-hashi", character: "箸", meaning: "chopsticks", readingsKun: ["はし"], readingsOn: [], strokeCount: 14, jlptLevel: "N4", gradeLevel: null, primaryRadicalId: "el-take", mnemonic: "Chopsticks were historically bamboo (竹), shaped by a person (者).", vocabulary: [{ word: "箸", reading: "はし", meaning: "chopsticks" }, { word: "箸置き", reading: "はしおき", meaning: "chopstick rest" }] },
  { id: "kj-in", character: "員", meaning: "member, employee", readingsKun: [], readingsOn: ["イン"], strokeCount: 10, jlptLevel: "N3", gradeLevel: 3, primaryRadicalId: "el-kai", mnemonic: "Mouths (口) to feed counted in shells (貝) — payroll members.", vocabulary: [{ word: "会社員", reading: "かいしゃいん", meaning: "company employee" }, { word: "全員", reading: "ぜんいん", meaning: "everyone, all members" }] },
  { id: "kj-kau", character: "買", meaning: "buy", readingsKun: ["か(う)"], readingsOn: ["バイ"], strokeCount: 12, jlptLevel: "N5", gradeLevel: 2, primaryRadicalId: "el-kai", mnemonic: "Catching shellfish (貝) in a net (罒) — shells were currency, so you buy.", vocabulary: [{ word: "買う", reading: "かう", meaning: "to buy" }, { word: "買い物", reading: "かいもの", meaning: "shopping" }] },
  { id: "kj-touge", character: "峠", meaning: "mountain pass", readingsKun: ["とうげ"], readingsOn: [], strokeCount: 9, jlptLevel: "N1", gradeLevel: null, primaryRadicalId: "el-yama", mnemonic: "On a mountain (山), you go up (上) then down (下) — that's the pass.", vocabulary: [{ word: "峠", reading: "とうげ", meaning: "mountain pass, peak" }] },
];

export interface CompositionDef {
  kanjiId: string;
  elementId: string;
  role: ElementRole;
  position: string | null;
  /** Shape as it actually appears inside the kanji (may be an alt form). */
  renderedAs: string;
  orderIndex: number;
}

const C = (
  kanjiId: string,
  elementId: string,
  role: ElementRole,
  renderedAs: string,
  position: string | null,
  orderIndex: number
): CompositionDef => ({ kanjiId, elementId, role, renderedAs, position, orderIndex });

export const COMPOSITION: CompositionDef[] = [
  ...[
    C("kj-mei", "el-hi2", "semantic", "日", "left", 0),
    C("kj-mei", "el-tsuki", "semantic", "月", "right", 1),
    C("kj-yasumu", "el-hito", "semantic", "亻", "left", 0),
    C("kj-yasumu", "el-ki", "semantic", "木", "right", 1),
    C("kj-hayashi", "el-ki", "semantic", "木", "left", 0),
    C("kj-hayashi", "el-ki", "semantic", "木", "right", 1),
    C("kj-mori", "el-ki", "semantic", "木", "top", 0),
    C("kj-mori", "el-ki", "semantic", "木", "bottom-left", 1),
    C("kj-mori", "el-ki", "semantic", "木", "bottom-right", 2),
    C("kj-suki", "el-onna", "semantic", "女", "left", 0),
    C("kj-suki", "el-ko", "semantic", "子", "right", 1),
    C("kj-otoko", "el-ta", "semantic", "田", "top", 0),
    C("kj-otoko", "el-chikara", "semantic", "力", "bottom", 1),
    C("kj-hana", "el-kusakanmuri", "semantic", "艹", "top", 0),
    C("kj-hana", "el-ka", "phonetic", "化", "bottom", 1),
    C("kj-cha", "el-kusakanmuri", "semantic", "艹", "top", 0),
    C("kj-cha", "el-hito", "structural", "人", "middle", 1),
    C("kj-cha", "el-ki", "semantic", "木", "bottom", 2),
    C("kj-go", "el-gen", "semantic", "言", "left", 0),
    C("kj-go", "el-go", "phonetic", "五", "top-right", 1),
    C("kj-go", "el-kuchi", "semantic", "口", "bottom-right", 2),
    C("kj-kiku", "el-mon", "positional", "門", "enclosure", 0),
    C("kj-kiku", "el-mimi", "semantic", "耳", "inside", 1),
    C("kj-toki", "el-hi2", "semantic", "日", "left", 0),
    C("kj-toki", "el-tera", "phonetic", "寺", "right", 1),
    C("kj-aida", "el-mon", "positional", "門", "enclosure", 0),
    C("kj-aida", "el-hi2", "semantic", "日", "inside", 1),
    C("kj-yuki", "el-ame", "semantic", "雨", "top", 0),
    C("kj-yuki", "el-kei", "semantic", "彐", "bottom", 1),
    C("kj-den", "el-ame", "semantic", "雨", "top", 0),
    C("kj-den", "el-ta", "semantic", "田", "bottom", 1),
    C("kj-umi", "el-mizu", "semantic", "氵", "left", 0),
    C("kj-umi", "el-mai", "phonetic", "每", "right", 1),
    C("kj-arau", "el-mizu", "semantic", "氵", "left", 0),
    C("kj-arau", "el-saki", "phonetic", "先", "right", 1),
    C("kj-ase", "el-mizu", "semantic", "氵", "left", 0),
    C("kj-ase", "el-hosu", "phonetic", "干", "right", 1),
    C("kj-akari", "el-hi", "semantic", "火", "left", 0),
    C("kj-akari", "el-chou", "phonetic", "丁", "right", 1),
    C("kj-motsu", "el-te", "semantic", "扌", "left", 0),
    C("kj-motsu", "el-tera", "phonetic", "寺", "right", 1),
    C("kj-maneku", "el-te", "semantic", "扌", "left", 0),
    C("kj-maneku", "el-mesu", "phonetic", "召", "right", 1),
    C("kj-iki", "el-mizukara", "semantic", "自", "top", 0),
    C("kj-iki", "el-kokoro", "semantic", "心", "bottom", 1),
    C("kj-toru", "el-mimi", "semantic", "耳", "left", 0),
    C("kj-toru", "el-mata", "semantic", "又", "right", 1),
    C("kj-miru", "el-me", "semantic", "目", "top", 0),
    C("kj-miru", "el-hizanashi", "structural", "儿", "bottom", 1),
    C("kj-hashiru", "el-tsuchi", "semantic", "土", "top", 0),
    C("kj-hashiru", "el-eki", "semantic", "疋", "bottom", 1),
    C("kj-matsu", "el-gyouninben", "semantic", "彳", "left", 0),
    C("kj-matsu", "el-tera", "phonetic", "寺", "right", 1),
    C("kj-ji", "el-ukinben", "positional", "宀", "top", 0),
    C("kj-ji", "el-ko", "semantic", "子", "bottom", 1),
    C("kj-yasui", "el-ukinben", "positional", "宀", "top", 0),
    C("kj-yasui", "el-onna", "semantic", "女", "bottom", 1),
    C("kj-shitsu", "el-ukinben", "positional", "宀", "top", 0),
    C("kj-shitsu", "el-itaru", "phonetic", "至", "bottom", 1),
    C("kj-hako", "el-take", "semantic", "⺮", "top", 0),
    C("kj-hako", "el-ki", "semantic", "木", "bottom-left", 1),
    C("kj-hako", "el-me", "phonetic", "目", "bottom-right", 2),
    C("kj-hashi", "el-take", "semantic", "⺮", "top", 0),
    C("kj-hashi", "el-mono", "phonetic", "者", "bottom", 1),
    C("kj-in", "el-kuchi", "semantic", "口", "top", 0),
    C("kj-in", "el-kai", "semantic", "貝", "bottom", 1),
    C("kj-kau", "el-amime", "semantic", "罒", "top", 0),
    C("kj-kau", "el-kai", "semantic", "貝", "bottom", 1),
    C("kj-touge", "el-yama", "semantic", "山", "left", 0),
    C("kj-touge", "el-ue", "semantic", "上", "top-right", 1),
    C("kj-touge", "el-shita", "semantic", "下", "bottom-right", 2),
  ],
];

/** 先 is referenced by 洗 but was not declared above — declare it here. */
export const EXTRA_ELEMENTS: ElementDef[] = [
  { id: "el-saki", character: "先", altForms: [], meaning: "before, ahead", readingKun: "さき", readingOn: "セン", strokeCount: 6, kangxiNumber: null, category: "primitive", typicalRole: "phonetic", mnemonic: "An earlier foot (儿) under a travelling figure." },
];
