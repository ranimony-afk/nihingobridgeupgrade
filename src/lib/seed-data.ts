// Static seed content for Nihongo Bridge.

export type SeedCard = {
  front: string;
  reading: string;
  back: string;
  example?: string;
  exampleTranslation?: string;
};

export type SeedDeck = {
  slug: string;
  title: string;
  description: string;
  category: "kana" | "vocab" | "grammar";
  emoji: string;
  cards: SeedCard[];
};

const hiragana: SeedCard[] = [
  ["あ", "a"], ["い", "i"], ["う", "u"], ["え", "e"], ["お", "o"],
  ["か", "ka"], ["き", "ki"], ["く", "ku"], ["け", "ke"], ["こ", "ko"],
  ["さ", "sa"], ["し", "shi"], ["す", "su"], ["せ", "se"], ["そ", "so"],
  ["た", "ta"], ["ち", "chi"], ["つ", "tsu"], ["て", "te"], ["と", "to"],
  ["な", "na"], ["に", "ni"], ["ぬ", "nu"], ["ね", "ne"], ["の", "no"],
  ["は", "ha"], ["ひ", "hi"], ["ふ", "fu"], ["へ", "he"], ["ほ", "ho"],
  ["ま", "ma"], ["み", "mi"], ["む", "mu"], ["め", "me"], ["も", "mo"],
  ["や", "ya"], ["ゆ", "yu"], ["よ", "yo"],
  ["ら", "ra"], ["り", "ri"], ["る", "ru"], ["れ", "re"], ["ろ", "ro"],
  ["わ", "wa"], ["を", "wo"], ["ん", "n"],
].map(([front, reading]) => ({
  front,
  reading,
  back: `The hiragana “${reading}”`,
}));

const katakana: SeedCard[] = [
  ["ア", "a"], ["イ", "i"], ["ウ", "u"], ["エ", "e"], ["オ", "o"],
  ["カ", "ka"], ["キ", "ki"], ["ク", "ku"], ["ケ", "ke"], ["コ", "ko"],
  ["サ", "sa"], ["シ", "shi"], ["ス", "su"], ["セ", "se"], ["ソ", "so"],
  ["タ", "ta"], ["チ", "chi"], ["ツ", "tsu"], ["テ", "te"], ["ト", "to"],
  ["ナ", "na"], ["ニ", "ni"], ["ヌ", "nu"], ["ネ", "ne"], ["ノ", "no"],
  ["ハ", "ha"], ["ヒ", "hi"], ["フ", "fu"], ["ヘ", "he"], ["ホ", "ho"],
  ["マ", "ma"], ["ミ", "mi"], ["ム", "mu"], ["メ", "me"], ["モ", "mo"],
  ["ヤ", "ya"], ["ユ", "yu"], ["ヨ", "yo"],
  ["ラ", "ra"], ["リ", "ri"], ["ル", "ru"], ["レ", "re"], ["ロ", "ro"],
  ["ワ", "wa"], ["ヲ", "wo"], ["ン", "n"],
].map(([front, reading]) => ({
  front,
  reading,
  back: `The katakana “${reading}”`,
}));

const greetings: SeedCard[] = [
  {
    front: "こんにちは",
    reading: "konnichiwa",
    back: "Hello / Good afternoon",
    example: "こんにちは、田中さん。",
    exampleTranslation: "Hello, Mr. Tanaka.",
  },
  {
    front: "おはよう",
    reading: "ohayou",
    back: "Good morning (casual)",
    example: "おはよう！元気？",
    exampleTranslation: "Morning! How are you?",
  },
  {
    front: "こんばんは",
    reading: "konbanwa",
    back: "Good evening",
    example: "こんばんは、いい夜ですね。",
    exampleTranslation: "Good evening, nice night isn't it.",
  },
  {
    front: "ありがとう",
    reading: "arigatou",
    back: "Thank you",
    example: "手伝ってくれてありがとう。",
    exampleTranslation: "Thanks for helping me.",
  },
  {
    front: "すみません",
    reading: "sumimasen",
    back: "Excuse me / Sorry",
    example: "すみません、駅はどこですか。",
    exampleTranslation: "Excuse me, where is the station?",
  },
  {
    front: "さようなら",
    reading: "sayounara",
    back: "Goodbye",
    example: "さようなら、また明日。",
    exampleTranslation: "Goodbye, see you tomorrow.",
  },
  {
    front: "はじめまして",
    reading: "hajimemashite",
    back: "Nice to meet you",
    example: "はじめまして、山田です。",
    exampleTranslation: "Nice to meet you, I'm Yamada.",
  },
  {
    front: "おやすみ",
    reading: "oyasumi",
    back: "Good night",
    example: "もう寝るね、おやすみ。",
    exampleTranslation: "I'm going to sleep now, good night.",
  },
];

const n5vocab: SeedCard[] = [
  { front: "水", reading: "みず (mizu)", back: "water", example: "水を飲みます。", exampleTranslation: "I drink water." },
  { front: "食べる", reading: "たべる (taberu)", back: "to eat", example: "りんごを食べる。", exampleTranslation: "I eat an apple." },
  { front: "飲む", reading: "のむ (nomu)", back: "to drink", example: "お茶を飲む。", exampleTranslation: "I drink tea." },
  { front: "行く", reading: "いく (iku)", back: "to go", example: "学校へ行く。", exampleTranslation: "I go to school." },
  { front: "見る", reading: "みる (miru)", back: "to see / watch", example: "映画を見る。", exampleTranslation: "I watch a movie." },
  { front: "本", reading: "ほん (hon)", back: "book", example: "本を読みます。", exampleTranslation: "I read a book." },
  { front: "犬", reading: "いぬ (inu)", back: "dog", example: "犬がいます。", exampleTranslation: "There is a dog." },
  { front: "猫", reading: "ねこ (neko)", back: "cat", example: "猫が好きです。", exampleTranslation: "I like cats." },
  { front: "学校", reading: "がっこう (gakkou)", back: "school", example: "学校は大きいです。", exampleTranslation: "The school is big." },
  { front: "友達", reading: "ともだち (tomodachi)", back: "friend", example: "友達と話す。", exampleTranslation: "I talk with a friend." },
  { front: "先生", reading: "せんせい (sensei)", back: "teacher", example: "先生は優しい。", exampleTranslation: "The teacher is kind." },
  { front: "大きい", reading: "おおきい (ookii)", back: "big", example: "大きい家。", exampleTranslation: "A big house." },
  { front: "小さい", reading: "ちいさい (chiisai)", back: "small", example: "小さい犬。", exampleTranslation: "A small dog." },
  { front: "新しい", reading: "あたらしい (atarashii)", back: "new", example: "新しい車。", exampleTranslation: "A new car." },
  { front: "今日", reading: "きょう (kyou)", back: "today", example: "今日は暑い。", exampleTranslation: "Today is hot." },
  { front: "時間", reading: "じかん (jikan)", back: "time / hour", example: "時間がない。", exampleTranslation: "There's no time." },
];

const numbers: SeedCard[] = [
  { front: "一", reading: "いち (ichi)", back: "one" },
  { front: "二", reading: "に (ni)", back: "two" },
  { front: "三", reading: "さん (san)", back: "three" },
  { front: "四", reading: "し / よん (shi/yon)", back: "four" },
  { front: "五", reading: "ご (go)", back: "five" },
  { front: "六", reading: "ろく (roku)", back: "six" },
  { front: "七", reading: "しち / なな (shichi/nana)", back: "seven" },
  { front: "八", reading: "はち (hachi)", back: "eight" },
  { front: "九", reading: "きゅう (kyuu)", back: "nine" },
  { front: "十", reading: "じゅう (juu)", back: "ten" },
  { front: "百", reading: "ひゃく (hyaku)", back: "hundred" },
  { front: "千", reading: "せん (sen)", back: "thousand" },
];

export const seedDecks: SeedDeck[] = [
  {
    slug: "hiragana",
    title: "Hiragana",
    description: "The 46 basic hiragana characters — the foundation of Japanese reading.",
    category: "kana",
    emoji: "あ",
    cards: hiragana,
  },
  {
    slug: "katakana",
    title: "Katakana",
    description: "The 46 basic katakana characters, used for loanwords and emphasis.",
    category: "kana",
    emoji: "ア",
    cards: katakana,
  },
  {
    slug: "greetings",
    title: "Everyday Greetings",
    description: "Essential phrases to start speaking Japanese right away.",
    category: "vocab",
    emoji: "👋",
    cards: greetings,
  },
  {
    slug: "n5-vocabulary",
    title: "JLPT N5 Vocabulary",
    description: "Core beginner nouns, verbs and adjectives with example sentences.",
    category: "vocab",
    emoji: "🌱",
    cards: n5vocab,
  },
  {
    slug: "numbers",
    title: "Numbers & Counting",
    description: "Learn to count from one to a thousand in Japanese.",
    category: "vocab",
    emoji: "🔢",
    cards: numbers,
  },
];
