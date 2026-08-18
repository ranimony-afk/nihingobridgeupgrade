import type { ExercisePayload } from "@/db/schema";
import { media } from "@/lib/media";
import { pickDistractors, shuffle } from "@/lib/utils";

export type BankItem = {
  ja: string;
  romaji: string;
  en: string;
};

export type UnitSeed = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  color: string;
  icon: string;
  sortOrder: number;
};

export type LessonSeed = {
  id: string;
  unitId: string;
  slug: string;
  title: string;
  summary: string;
  sortOrder: number;
  xpReward: number;
  kind: "lesson" | "story";
  bank: BankItem[];
  phrases?: { ja: string; romaji: string; en: string; tiles: string[] }[];
};

export const UNITS: UnitSeed[] = [
  {
    id: "unit-hiragana",
    slug: "hiragana-harbor",
    title: "Hiragana Harbor",
    subtitle: "Meet the あいうえお tide",
    color: "#1cb0f6",
    icon: "あ",
    sortOrder: 1,
  },
  {
    id: "unit-katakana",
    slug: "katakana-neon",
    title: "Katakana Neon",
    subtitle: "Loanwords under Shinjuku lights",
    color: "#ce82ff",
    icon: "ア",
    sortOrder: 2,
  },
  {
    id: "unit-greetings",
    slug: "konnichiwa-club",
    title: "Konnichiwa Club",
    subtitle: "First words that open doors",
    color: "#58cc02",
    icon: "こ",
    sortOrder: 3,
  },
  {
    id: "unit-food",
    slug: "tokyo-table",
    title: "Tokyo Table",
    subtitle: "Order ramen like a local",
    color: "#ff9600",
    icon: "🍜",
    sortOrder: 4,
  },
  {
    id: "unit-travel",
    slug: "yamanote-ride",
    title: "Yamanote Ride",
    subtitle: "Trains, tickets, and turns",
    color: "#ff4b4b",
    icon: "🚃",
    sortOrder: 5,
  },
  {
    id: "unit-n5",
    slug: "n5-spark",
    title: "N5 Spark",
    subtitle: "Particles that hold sentences together",
    color: "#ffc800",
    icon: "N5",
    sortOrder: 6,
  },
];

export const LESSONS: LessonSeed[] = [
  {
    id: "lesson-vowels",
    unitId: "unit-hiragana",
    slug: "vowel-tide",
    title: "Vowel Tide",
    summary: "あ い う え お — the five sounds everything sits on.",
    sortOrder: 1,
    xpReward: 10,
    kind: "lesson",
    bank: [
      { ja: "あ", romaji: "a", en: "a" },
      { ja: "い", romaji: "i", en: "i" },
      { ja: "う", romaji: "u", en: "u" },
      { ja: "え", romaji: "e", en: "e" },
      { ja: "お", romaji: "o", en: "o" },
    ],
  },
  {
    id: "lesson-ka",
    unitId: "unit-hiragana",
    slug: "ka-current",
    title: "Ka Current",
    summary: "か き く け こ — the first consonant row.",
    sortOrder: 2,
    xpReward: 10,
    kind: "lesson",
    bank: [
      { ja: "か", romaji: "ka", en: "ka" },
      { ja: "き", romaji: "ki", en: "ki" },
      { ja: "く", romaji: "ku", en: "ku" },
      { ja: "け", romaji: "ke", en: "ke" },
      { ja: "こ", romaji: "ko", en: "ko" },
    ],
  },
  {
    id: "lesson-sa",
    unitId: "unit-hiragana",
    slug: "sa-breeze",
    title: "Sa Breeze",
    summary: "さ し す せ そ — listen for the soft shi.",
    sortOrder: 3,
    xpReward: 10,
    kind: "lesson",
    bank: [
      { ja: "さ", romaji: "sa", en: "sa" },
      { ja: "し", romaji: "shi", en: "shi" },
      { ja: "す", romaji: "su", en: "su" },
      { ja: "せ", romaji: "se", en: "se" },
      { ja: "そ", romaji: "so", en: "so" },
    ],
  },
  {
    id: "lesson-kana-words",
    unitId: "unit-hiragana",
    slug: "first-words",
    title: "First Words",
    summary: "Turn kana into words you can actually say.",
    sortOrder: 4,
    xpReward: 15,
    kind: "lesson",
    bank: [
      { ja: "あお", romaji: "ao", en: "blue" },
      { ja: "いえ", romaji: "ie", en: "house" },
      { ja: "すし", romaji: "sushi", en: "sushi" },
      { ja: "かさ", romaji: "kasa", en: "umbrella" },
      { ja: "ここ", romaji: "koko", en: "here" },
    ],
    phrases: [
      { ja: "ここです", romaji: "koko desu", en: "It is here", tiles: ["ここ", "です"] },
    ],
  },
  {
    id: "lesson-kata-vowels",
    unitId: "unit-katakana",
    slug: "neon-vowels",
    title: "Neon Vowels",
    summary: "アイウエオ — the same sounds, sharper shapes.",
    sortOrder: 5,
    xpReward: 10,
    kind: "lesson",
    bank: [
      { ja: "ア", romaji: "a", en: "a" },
      { ja: "イ", romaji: "i", en: "i" },
      { ja: "ウ", romaji: "u", en: "u" },
      { ja: "エ", romaji: "e", en: "e" },
      { ja: "オ", romaji: "o", en: "o" },
    ],
  },
  {
    id: "lesson-loanwords",
    unitId: "unit-katakana",
    slug: "loanword-lane",
    title: "Loanword Lane",
    summary: "Coffee, ice, and taxis — Japan in katakana.",
    sortOrder: 6,
    xpReward: 12,
    kind: "lesson",
    bank: [
      { ja: "コーヒー", romaji: "koohii", en: "coffee" },
      { ja: "アイス", romaji: "aisu", en: "ice cream" },
      { ja: "タクシー", romaji: "takushii", en: "taxi" },
      { ja: "ホテル", romaji: "hoteru", en: "hotel" },
      { ja: "テレビ", romaji: "terebi", en: "television" },
    ],
  },
  {
    id: "lesson-menu",
    unitId: "unit-katakana",
    slug: "cafe-menu",
    title: "Cafe Menu",
    summary: "Read a kissaten board without guessing.",
    sortOrder: 7,
    xpReward: 12,
    kind: "lesson",
    bank: [
      { ja: "ケーキ", romaji: "keeki", en: "cake" },
      { ja: "ジュース", romaji: "juusu", en: "juice" },
      { ja: "サンドイッチ", romaji: "sandoicchi", en: "sandwich" },
      { ja: "メニュー", romaji: "menyuu", en: "menu" },
      { ja: "アイスコーヒー", romaji: "aisu koohii", en: "iced coffee" },
    ],
    phrases: [
      {
        ja: "コーヒーをください",
        romaji: "koohii o kudasai",
        en: "Coffee, please",
        tiles: ["コーヒー", "を", "ください"],
      },
    ],
  },
  {
    id: "lesson-hello",
    unitId: "unit-greetings",
    slug: "hello-tokyo",
    title: "Hello, Tokyo",
    summary: "The everyday hellos that keep Japan polite.",
    sortOrder: 8,
    xpReward: 12,
    kind: "lesson",
    bank: [
      { ja: "こんにちは", romaji: "konnichiwa", en: "hello / good afternoon" },
      { ja: "おはよう", romaji: "ohayou", en: "good morning" },
      { ja: "こんばんは", romaji: "konbanwa", en: "good evening" },
      { ja: "おやすみ", romaji: "oyasumi", en: "good night" },
      { ja: "さようなら", romaji: "sayounara", en: "goodbye" },
    ],
  },
  {
    id: "lesson-thanks",
    unitId: "unit-greetings",
    slug: "please-and-thanks",
    title: "Please & Thanks",
    summary: "The three phrases you will use every hour.",
    sortOrder: 9,
    xpReward: 12,
    kind: "lesson",
    bank: [
      { ja: "ありがとう", romaji: "arigatou", en: "thank you" },
      { ja: "すみません", romaji: "sumimasen", en: "excuse me / sorry" },
      { ja: "お願いします", romaji: "onegaishimasu", en: "please" },
      { ja: "いいえ", romaji: "iie", en: "no / not at all" },
      { ja: "はい", romaji: "hai", en: "yes" },
    ],
    phrases: [
      {
        ja: "ありがとうございます",
        romaji: "arigatou gozaimasu",
        en: "Thank you very much",
        tiles: ["ありがとう", "ございます"],
      },
    ],
  },
  {
    id: "lesson-meet",
    unitId: "unit-greetings",
    slug: "nice-to-meet-you",
    title: "Nice to Meet You",
    summary: "Introduce yourself without freezing.",
    sortOrder: 10,
    xpReward: 15,
    kind: "lesson",
    bank: [
      { ja: "はじめまして", romaji: "hajimemashite", en: "nice to meet you" },
      { ja: "よろしく", romaji: "yoroshiku", en: "please treat me well" },
      { ja: "わたし", romaji: "watashi", en: "I / me" },
      { ja: "なまえ", romaji: "namae", en: "name" },
      { ja: "です", romaji: "desu", en: "is / am / are" },
    ],
    phrases: [
      {
        ja: "わたしはもちです",
        romaji: "watashi wa mochi desu",
        en: "I am Mochi",
        tiles: ["わたし", "は", "もち", "です"],
      },
    ],
  },
  {
    id: "lesson-food-words",
    unitId: "unit-food",
    slug: "first-bites",
    title: "First Bites",
    summary: "Water, rice, sushi — start with what you crave.",
    sortOrder: 11,
    xpReward: 12,
    kind: "lesson",
    bank: [
      { ja: "みず", romaji: "mizu", en: "water" },
      { ja: "ごはん", romaji: "gohan", en: "rice / a meal" },
      { ja: "すし", romaji: "sushi", en: "sushi" },
      { ja: "ラーメン", romaji: "raamen", en: "ramen" },
      { ja: "お茶", romaji: "ocha", en: "tea" },
    ],
  },
  {
    id: "lesson-tasty",
    unitId: "unit-food",
    slug: "tasty-words",
    title: "Tasty Words",
    summary: "Say what you like before the chef asks.",
    sortOrder: 12,
    xpReward: 12,
    kind: "lesson",
    bank: [
      { ja: "おいしい", romaji: "oishii", en: "delicious" },
      { ja: "あまい", romaji: "amai", en: "sweet" },
      { ja: "からい", romaji: "karai", en: "spicy" },
      { ja: "すき", romaji: "suki", en: "like" },
      { ja: "ください", romaji: "kudasai", en: "please give me" },
    ],
  },
  {
    id: "lesson-order",
    unitId: "unit-food",
    slug: "counter-order",
    title: "Counter Order",
    summary: "Get a bowl in front of you, politely.",
    sortOrder: 13,
    xpReward: 15,
    kind: "lesson",
    bank: [
      { ja: "メニュー", romaji: "menyuu", en: "menu" },
      { ja: "会計", romaji: "kaikei", en: "the bill" },
      { ja: "ひとつ", romaji: "hitotsu", en: "one (item)" },
      { ja: "ふたつ", romaji: "futatsu", en: "two (items)" },
      { ja: "おいしいです", romaji: "oishii desu", en: "it is delicious" },
    ],
    phrases: [
      {
        ja: "ラーメンをひとつください",
        romaji: "raamen o hitotsu kudasai",
        en: "One ramen, please",
        tiles: ["ラーメン", "を", "ひとつ", "ください"],
      },
    ],
  },
  {
    id: "lesson-station",
    unitId: "unit-travel",
    slug: "station-signs",
    title: "Station Signs",
    summary: "Read the platform before the doors close.",
    sortOrder: 14,
    xpReward: 12,
    kind: "lesson",
    bank: [
      { ja: "駅", romaji: "eki", en: "station" },
      { ja: "電車", romaji: "densha", en: "train" },
      { ja: "切符", romaji: "kippu", en: "ticket" },
      { ja: "出口", romaji: "deguchi", en: "exit" },
      { ja: "入口", romaji: "iriguchi", en: "entrance" },
    ],
  },
  {
    id: "lesson-directions",
    unitId: "unit-travel",
    slug: "left-and-right",
    title: "Left & Right",
    summary: "Ask for help and actually follow it.",
    sortOrder: 15,
    xpReward: 12,
    kind: "lesson",
    bank: [
      { ja: "右", romaji: "migi", en: "right" },
      { ja: "左", romaji: "hidari", en: "left" },
      { ja: "まっすぐ", romaji: "massugu", en: "straight ahead" },
      { ja: "どこ", romaji: "doko", en: "where" },
      { ja: "ここ", romaji: "koko", en: "here" },
    ],
    phrases: [
      {
        ja: "駅はどこですか",
        romaji: "eki wa doko desu ka",
        en: "Where is the station?",
        tiles: ["駅", "は", "どこ", "ですか"],
      },
    ],
  },
  {
    id: "lesson-numbers",
    unitId: "unit-travel",
    slug: "ticket-numbers",
    title: "Ticket Numbers",
    summary: "Count yen, platforms, and minutes.",
    sortOrder: 16,
    xpReward: 15,
    kind: "lesson",
    bank: [
      { ja: "一", romaji: "ichi", en: "one" },
      { ja: "二", romaji: "ni", en: "two" },
      { ja: "三", romaji: "san", en: "three" },
      { ja: "四", romaji: "yon", en: "four" },
      { ja: "五", romaji: "go", en: "five" },
      { ja: "いくら", romaji: "ikura", en: "how much" },
    ],
    phrases: [
      {
        ja: "これはいくらですか",
        romaji: "kore wa ikura desu ka",
        en: "How much is this?",
        tiles: ["これ", "は", "いくら", "ですか"],
      },
    ],
  },
  {
    id: "lesson-wa",
    unitId: "unit-n5",
    slug: "topic-wa",
    title: "The は Particle",
    summary: "は marks the topic — what the sentence is about.",
    sortOrder: 17,
    xpReward: 15,
    kind: "lesson",
    bank: [
      { ja: "は", romaji: "wa", en: "topic particle" },
      { ja: "これ", romaji: "kore", en: "this" },
      { ja: "それ", romaji: "sore", en: "that" },
      { ja: "だれ", romaji: "dare", en: "who" },
      { ja: "学生", romaji: "gakusei", en: "student" },
    ],
    phrases: [
      {
        ja: "これは本です",
        romaji: "kore wa hon desu",
        en: "This is a book",
        tiles: ["これ", "は", "本", "です"],
      },
    ],
  },
  {
    id: "lesson-desu",
    unitId: "unit-n5",
    slug: "polite-desu",
    title: "Polite です",
    summary: "です keeps things calm, complete, and polite.",
    sortOrder: 18,
    xpReward: 15,
    kind: "lesson",
    bank: [
      { ja: "です", romaji: "desu", en: "is / am / are" },
      { ja: "ではありません", romaji: "dewa arimasen", en: "is not" },
      { ja: "ですか", romaji: "desu ka", en: "is it? (question)" },
      { ja: "本", romaji: "hon", en: "book" },
      { ja: "日本人", romaji: "nihonjin", en: "Japanese person" },
    ],
    phrases: [
      {
        ja: "わたしは学生です",
        romaji: "watashi wa gakusei desu",
        en: "I am a student",
        tiles: ["わたし", "は", "学生", "です"],
      },
    ],
  },
  {
    id: "lesson-wo",
    unitId: "unit-n5",
    slug: "object-wo",
    title: "The を Particle",
    summary: "を points at the thing you do something to.",
    sortOrder: 19,
    xpReward: 15,
    kind: "lesson",
    bank: [
      { ja: "を", romaji: "o", en: "object particle" },
      { ja: "食べます", romaji: "tabemasu", en: "eat" },
      { ja: "飲みます", romaji: "nomimasu", en: "drink" },
      { ja: "見ます", romaji: "mimasu", en: "look / watch" },
      { ja: "買います", romaji: "kaimasu", en: "buy" },
    ],
    phrases: [
      {
        ja: "水を飲みます",
        romaji: "mizu o nomimasu",
        en: "I drink water",
        tiles: ["水", "を", "飲みます"],
      },
    ],
  },
];

export const ACHIEVEMENTS = [
  { id: "ach-first", slug: "first-step", title: "First Step", description: "Finish your first lesson.", icon: "👣" },
  { id: "ach-perfect", slug: "perfect-run", title: "Clean Sweep", description: "Complete a lesson with 100% accuracy.", icon: "💎" },
  { id: "ach-streak3", slug: "ember", title: "Ember", description: "Keep a 3-day streak alive.", icon: "🔥" },
  { id: "ach-streak7", slug: "week-warrior", title: "Week Warrior", description: "Study 7 days in a row.", icon: "🗓️" },
  { id: "ach-xp100", slug: "spark-100", title: "Hundred Spark", description: "Earn 100 total XP.", icon: "⚡" },
  { id: "ach-xp500", slug: "bridge-500", title: "Bridge Builder", description: "Earn 500 total XP.", icon: "🌉" },
  { id: "ach-story", slug: "storyteller", title: "Storyteller", description: "Finish a illustrated story.", icon: "📖" },
  { id: "ach-shop", slug: "generous", title: "Shop Regular", description: "Buy something from the gem shop.", icon: "🛍️" },
  { id: "ach-kana", slug: "kana-captain", title: "Kana Captain", description: "Clear every Hiragana Harbor lesson.", icon: "⛵" },
  { id: "ach-foodie", slug: "foodie", title: "Midnight Ramen", description: "Finish the Tokyo Table unit.", icon: "🍜" },
];

export const SHOP = [
  {
    id: "shop-hearts",
    slug: "heart-refill",
    name: "Heart Refill",
    description: "Fill every heart right now.",
    cost: 100,
    kind: "hearts",
    value: "full",
    icon: "❤️",
  },
  {
    id: "shop-freeze",
    slug: "streak-freeze",
    name: "Streak Freeze",
    description: "Miss a day and Mochi covers for you.",
    cost: 200,
    kind: "freeze",
    value: "1",
    icon: "🧊",
  },
  {
    id: "shop-double",
    slug: "double-xp",
    name: "Double XP",
    description: "15 minutes of 2× XP.",
    cost: 150,
    kind: "double",
    value: "15",
    icon: "⚡",
  },
  {
    id: "shop-happi",
    slug: "outfit-happi",
    name: "Festival Happi",
    description: "Mochi waves from the matsuri.",
    cost: 250,
    kind: "outfit",
    value: "happi",
    icon: "🎎",
  },
  {
    id: "shop-sensei",
    slug: "outfit-sensei",
    name: "Sensei Specs",
    description: "Study mode: thinking pose unlocked.",
    cost: 300,
    kind: "outfit",
    value: "sensei",
    icon: "👓",
  },
  {
    id: "shop-ninja",
    slug: "outfit-ninja",
    name: "Ninja Leap",
    description: "Celebrate every correct answer louder.",
    cost: 350,
    kind: "outfit",
    value: "ninja",
    icon: "🥷",
  },
];

export const CHESTS = [
  { id: "chest-1", afterIndex: 4, gems: 40, title: "Harbor Chest" },
  { id: "chest-2", afterIndex: 8, gems: 60, title: "Neon Chest" },
  { id: "chest-3", afterIndex: 13, gems: 80, title: "Kitchen Chest" },
  { id: "chest-4", afterIndex: 19, gems: 120, title: "N5 Treasure" },
];

export const STORIES = [
  {
    id: "story-ramen",
    slug: "mochi-ramen",
    title: "Mochi's First Ramen",
    teaser: "A shy tanuki walks into a midnight shop and orders like a pro.",
    cover: media.ramen,
    minutes: 3,
    level: "N5",
    lines: [
      { ja: "夜です。もちは東京にいます。", romaji: "Yoru desu. Mochi wa Tōkyō ni imasu.", en: "It is night. Mochi is in Tokyo." },
      { ja: "ラーメンやの入口です。", romaji: "Rāmen-ya no iriguchi desu.", en: "This is the entrance of a ramen shop." },
      { ja: "「すみません。メニューをください。」", romaji: "Sumimasen. Menyū o kudasai.", en: "Excuse me. The menu, please." },
      { ja: "「ラーメンをひとつください。」", romaji: "Rāmen o hitotsu kudasai.", en: "One ramen, please." },
      { ja: "ラーメンはとてもおいしいです。", romaji: "Rāmen wa totemo oishii desu.", en: "The ramen is very delicious." },
      { ja: "「ありがとうございます！」", romaji: "Arigatō gozaimasu!", en: "Thank you very much!" },
    ],
    quiz: [
      {
        prompt: "What does Mochi order?",
        options: ["Sushi", "Ramen", "Coffee", "Cake"],
        answer: "Ramen",
      },
      {
        prompt: "What does おいしい mean?",
        options: ["Spicy", "Expensive", "Delicious", "Cold"],
        answer: "Delicious",
      },
    ],
  },
  {
    id: "story-train",
    slug: "lost-on-yamanote",
    title: "Lost on the Yamanote",
    teaser: "The loop line is friendly — if you can read the signs.",
    cover: media.yamanote,
    minutes: 4,
    level: "N5",
    lines: [
      { ja: "もちは駅にいます。", romaji: "Mochi wa eki ni imasu.", en: "Mochi is at the station." },
      { ja: "切符はどこですか。", romaji: "Kippu wa doko desu ka.", en: "Where is the ticket?" },
      { ja: "「まっすぐです。右です。」", romaji: "Massugu desu. Migi desu.", en: "Go straight. It's on the right." },
      { ja: "電車がきます。", romaji: "Densha ga kimasu.", en: "The train is coming." },
      { ja: "出口は左です。", romaji: "Deguchi wa hidari desu.", en: "The exit is on the left." },
      { ja: "もちは東京駅です。よかった！", romaji: "Mochi wa Tōkyō-eki desu. Yokatta!", en: "Mochi is at Tokyo Station. What a relief!" },
    ],
    quiz: [
      {
        prompt: "Where is the exit?",
        options: ["On the left", "On the right", "Upstairs", "Outside the shop"],
        answer: "On the left",
      },
      {
        prompt: "駅 means…",
        options: ["Ticket", "Station", "Train", "Exit"],
        answer: "Station",
      },
    ],
  },
  {
    id: "story-sakura",
    slug: "sakura-picnic",
    title: "Cherry Blossom Picnic",
    teaser: "Blankets, bento, and a very proud tanuki under pink snow.",
    cover: media.cherryPath,
    minutes: 3,
    level: "N5",
    lines: [
      { ja: "きょうは春です。", romaji: "Kyō wa haru desu.", en: "Today is spring." },
      { ja: "さくらがきれいです。", romaji: "Sakura ga kirei desu.", en: "The cherry blossoms are beautiful." },
      { ja: "もちはお弁当を食べます。", romaji: "Mochi wa obentō o tabemasu.", en: "Mochi eats a bento." },
      { ja: "お茶を飲みます。", romaji: "Ocha o nomimasu.", en: "He drinks tea." },
      { ja: "ともだちは「すごい！」と言います。", romaji: "Tomodachi wa “sugoi!” to iimasu.", en: "A friend says “Amazing!”" },
      { ja: "もちはとてもうれしいです。", romaji: "Mochi wa totemo ureshii desu.", en: "Mochi is very happy." },
    ],
    quiz: [
      {
        prompt: "What season is it?",
        options: ["Winter", "Spring", "Autumn", "Rainy season"],
        answer: "Spring",
      },
      {
        prompt: "What does Mochi drink?",
        options: ["Coffee", "Juice", "Tea", "Water"],
        answer: "Tea",
      },
    ],
  },
];

export const BOTS = [
  { id: "bot-yuki", name: "Yuki Sato", avatar: "happi", xp: 640, weekly: 210 },
  { id: "bot-kenji", name: "Kenji", avatar: "ninja", xp: 520, weekly: 180 },
  { id: "bot-aiko", name: "Aiko", avatar: "sensei", xp: 480, weekly: 160 },
  { id: "bot-raj", name: "Raj", avatar: "mochi", xp: 390, weekly: 140 },
  { id: "bot-mei", name: "Mei Lin", avatar: "happi", xp: 310, weekly: 95 },
  { id: "bot-luca", name: "Luca", avatar: "mochi", xp: 220, weekly: 70 },
  { id: "bot-priya", name: "Priya", avatar: "sensei", xp: 180, weekly: 40 },
  { id: "bot-hiro", name: "Hiro", avatar: "ninja", xp: 90, weekly: 20 },
];

type BuiltExercise = {
  id: string;
  lessonId: string;
  type: string;
  sortOrder: number;
  payload: ExercisePayload;
};

function meaningPool(bank: BankItem[]) {
  return bank.map((item) => (item.en.length === 1 && item.en === item.romaji ? item.romaji : item.en));
}

export function buildExercises(lesson: LessonSeed): BuiltExercise[] {
  const built: BuiltExercise[] = [];
  const meanings = meaningPool(lesson.bank);
  const romaji = lesson.bank.map((item) => item.romaji);
  let order = 1;

  const push = (type: string, payload: ExercisePayload) => {
    built.push({
      id: `${lesson.id}-ex-${order}`,
      lessonId: lesson.id,
      type,
      sortOrder: order,
      payload,
    });
    order += 1;
  };

  for (const item of lesson.bank.slice(0, 4)) {
    const answer = item.en;
    push("select", {
      prompt: `What does ${item.ja} mean?`,
      promptJa: item.ja,
      speak: item.ja,
      options: shuffle([answer, ...pickDistractors(meanings, answer, 3)]),
      answer,
      accepted: [item.en, item.romaji],
      explanation: `${item.ja} is ${item.romaji} — ${item.en}.`,
    });
  }

  for (const item of lesson.bank.slice(0, 2)) {
    push("listen", {
      prompt: "Tap what you hear",
      speak: item.ja,
      options: shuffle([item.en, ...pickDistractors(meanings, item.en, 3)]),
      answer: item.en,
      accepted: [item.en, item.romaji],
      explanation: `You heard ${item.ja} (${item.romaji}).`,
    });
  }

  const first = lesson.bank[0];
  push("translate", {
    prompt: `Type the meaning of ${first.ja}`,
    promptJa: first.ja,
    speak: first.ja,
    answer: first.en,
    accepted: Array.from(new Set([first.en, first.romaji])),
    hint: `Romaji: ${first.romaji}`,
    explanation: `${first.ja} = ${first.en}`,
  });

  const pairSource = lesson.bank.slice(0, 4);
  push("match", {
    prompt: "Match the Japanese with the meaning",
    pairs: pairSource.map((item) => ({ left: item.ja, right: item.en })),
    answer: pairSource.map((item) => `${item.ja}=${item.en}`),
    explanation: "Nice matching.",
  });

  const fill = lesson.bank[Math.min(1, lesson.bank.length - 1)];
  push("fill", {
    prompt: `Choose the reading for ${fill.ja}`,
    promptJa: fill.ja,
    speak: fill.ja,
    options: shuffle([fill.romaji, ...pickDistractors(romaji, fill.romaji, 3)]),
    answer: fill.romaji,
    explanation: `${fill.ja} is read ${fill.romaji}.`,
  });

  for (const phrase of lesson.phrases ?? []) {
    push("tiles", {
      prompt: `Build: “${phrase.en}”`,
      speak: phrase.ja,
      tiles: shuffle(phrase.tiles),
      answer: phrase.tiles,
      accepted: [phrase.ja, phrase.romaji, phrase.en],
      explanation: `${phrase.ja} (${phrase.romaji})`,
    });
  }

  return built;
}

export const HIRAGANA_CHART = [
  ["あ", "い", "う", "え", "お"],
  ["か", "き", "く", "け", "こ"],
  ["さ", "し", "す", "せ", "そ"],
  ["た", "ち", "つ", "て", "と"],
  ["な", "に", "ぬ", "ね", "の"],
  ["は", "ひ", "ふ", "へ", "ほ"],
  ["ま", "み", "む", "め", "も"],
  ["や", "", "ゆ", "", "よ"],
  ["ら", "り", "る", "れ", "ろ"],
  ["わ", "", "ん", "", "を"],
];

export const HIRAGANA_ROMAJI: Record<string, string> = {
  あ: "a",
  い: "i",
  う: "u",
  え: "e",
  お: "o",
  か: "ka",
  き: "ki",
  く: "ku",
  け: "ke",
  こ: "ko",
  さ: "sa",
  し: "shi",
  す: "su",
  せ: "se",
  そ: "so",
  た: "ta",
  ち: "chi",
  つ: "tsu",
  て: "te",
  と: "to",
  な: "na",
  に: "ni",
  ぬ: "nu",
  ね: "ne",
  の: "no",
  は: "ha",
  ひ: "hi",
  ふ: "fu",
  へ: "he",
  ほ: "ho",
  ま: "ma",
  み: "mi",
  む: "mu",
  め: "me",
  も: "mo",
  や: "ya",
  ゆ: "yu",
  よ: "yo",
  ら: "ra",
  り: "ri",
  る: "ru",
  れ: "re",
  ろ: "ro",
  わ: "wa",
  を: "wo",
  ん: "n",
};

export const KATAKANA_CHART = [
  ["ア", "イ", "ウ", "エ", "オ"],
  ["カ", "キ", "ク", "ケ", "コ"],
  ["サ", "シ", "ス", "セ", "ソ"],
  ["タ", "チ", "ツ", "テ", "ト"],
  ["ナ", "ニ", "ヌ", "ネ", "ノ"],
  ["ハ", "ヒ", "フ", "ヘ", "ホ"],
  ["マ", "ミ", "ム", "メ", "モ"],
  ["ヤ", "", "ユ", "", "ヨ"],
  ["ラ", "リ", "ル", "レ", "ロ"],
  ["ワ", "", "ン", "", "ヲ"],
];

export const KATAKANA_ROMAJI: Record<string, string> = {
  ア: "a",
  イ: "i",
  ウ: "u",
  エ: "e",
  オ: "o",
  カ: "ka",
  キ: "ki",
  ク: "ku",
  ケ: "ke",
  コ: "ko",
  サ: "sa",
  シ: "shi",
  ス: "su",
  セ: "se",
  ソ: "so",
  タ: "ta",
  チ: "chi",
  ツ: "tsu",
  テ: "te",
  ト: "to",
  ナ: "na",
  ニ: "ni",
  ヌ: "nu",
  ネ: "ne",
  ノ: "no",
  ハ: "ha",
  ヒ: "hi",
  フ: "fu",
  ヘ: "he",
  ホ: "ho",
  マ: "ma",
  ミ: "mi",
  ム: "mu",
  メ: "me",
  モ: "mo",
  ヤ: "ya",
  ユ: "yu",
  ヨ: "yo",
  ラ: "ra",
  リ: "ri",
  ル: "ru",
  レ: "re",
  ロ: "ro",
  ワ: "wa",
  ヲ: "wo",
  ン: "n",
};
