import { Question } from "@/types/quiz";
import { JLPTTestModel } from "@/types/jlpt";

export const SAMPLE_N5_QUESTIONS: Question[] = [
  // ==========================================
  // SECTION 1: 言語知識（文字・語彙）
  // ==========================================

  // --- MONDAI 1: 漢字読み (Kanji Reading) ---
  {
    id: "n5-v-001",
    jlptLevel: "N5",
    section: "vocab",
    category: "kanji_reading",
    mondaiNumber: 1,
    mondaiTitle: "問題１ つぎの ぶんの の ことばは どう よみますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "あしたは <ruby>新しい<rt>____</rt></ruby> ほんを かいます。",
    promptFurigana: "あしたは <ruby>新<rt>あたら</rt></ruby>しい 本を 買います。",
    promptTranslation: "Tomorrow I will buy a new book.",
    options: [
      { id: "1", text: "あたらしい" },
      { id: "2", text: "ふるい" },
      { id: "3", text: "ただしい" },
      { id: "4", text: "うつくしい" },
    ],
    correctAnswer: "1",
    explanation: "「新しい」is read as「あたらしい」(atarashii), meaning 'new'.",
    explanationBreakdown: {
      vocabNotes: [
        { word: "新しい", reading: "あたらしい", meaning: "new" },
        { word: "古い", reading: "ふるい", meaning: "old" },
        { word: "正しい", reading: "ただしい", meaning: "correct" },
      ],
      whyWrong: {
        "2": "「ふるい」is written as「古い」(old).",
        "3": "「ただしい」is written as「正しい」(correct).",
        "4": "「うつくしい」is written as「美しい」(beautiful).",
      },
      strategyTip: "The kanji 新 has the kun-yomi あたら(しい) and on-yomi シン (as in 新聞 しんぶん).",
    },
    difficulty: 1,
    tags: ["kanji-reading", "i-adjectives", "daily-vocab"],
  },
  {
    id: "n5-v-002",
    jlptLevel: "N5",
    section: "vocab",
    category: "kanji_reading",
    mondaiNumber: 1,
    mondaiTitle: "問題１ つぎの ぶんの の ことばは どう よみますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "わたしは <ruby>毎朝<rt>____</rt></ruby>、パンを たべます。",
    promptFurigana: "わたしは <ruby>毎朝<rt>まいあさ</rt></ruby>、パンを 食べます。",
    promptTranslation: "I eat bread every morning.",
    options: [
      { id: "1", text: "まいばん" },
      { id: "2", text: "まいあさ" },
      { id: "3", text: "まいひ" },
      { id: "4", text: "まいとし" },
    ],
    correctAnswer: "2",
    explanation: "「毎朝」is read as「まいあさ」(maiasa), meaning 'every morning'.",
    explanationBreakdown: {
      vocabNotes: [
        { word: "毎朝", reading: "まいあさ", meaning: "every morning" },
        { word: "毎晩", reading: "まいばん", meaning: "every evening / night" },
        { word: "毎日", reading: "まいにち", meaning: "every day" },
      ],
      whyWrong: {
        "1": "「まいばん」is 毎晩 (every night).",
        "3": "Every day is「まいにち」(毎日), not まいひ.",
        "4": "「まいとし / まいねん」is 毎年 (every year).",
      },
    },
    difficulty: 1,
    tags: ["kanji-reading", "time-expressions"],
  },
  {
    id: "n5-v-003",
    jlptLevel: "N5",
    section: "vocab",
    category: "kanji_reading",
    mondaiNumber: 1,
    mondaiTitle: "問題１ つぎの ぶんの の ことばは どう よみますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "駅まで <ruby>電車<rt>____</rt></ruby>で いきました。",
    promptFurigana: "駅まで <ruby>電車<rt>でんしゃ</rt></ruby>で 行きました。",
    promptTranslation: "I went to the station by train.",
    options: [
      { id: "1", text: "じてんしゃ" },
      { id: "2", text: "じどうしゃ" },
      { id: "3", text: "でんしゃ" },
      { id: "4", text: "ちかてつ" },
    ],
    correctAnswer: "3",
    explanation: "「電車」combines 電 (electricity, でん) and 車 (car/vehicle, しゃ), read as「でんしゃ」(densha, electric train).",
    explanationBreakdown: {
      vocabNotes: [
        { word: "電車", reading: "でんしゃ", meaning: "train" },
        { word: "自転車", reading: "じてんしゃ", meaning: "bicycle" },
        { word: "自動車", reading: "じどうしゃ", meaning: "automobile/car" },
      ],
      whyWrong: {
        "1": "「じてんしゃ」is 自転車 (bicycle).",
        "2": "「じどうしゃ」is 自動車 (car).",
        "4": "「ちかてつ」is 地下鉄 (subway).",
      },
    },
    difficulty: 1,
    tags: ["kanji-reading", "transportation"],
  },
  {
    id: "n5-v-004",
    jlptLevel: "N5",
    section: "vocab",
    category: "kanji_reading",
    mondaiNumber: 1,
    mondaiTitle: "問題１ つぎの ぶんの の ことばは どう よみますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "きのう、<ruby>友だち<rt>____</rt></ruby>と あいました。",
    promptFurigana: "きのう、<ruby>友<rt>とも</rt></ruby>だちと 会いました。",
    promptTranslation: "Yesterday, I met with a friend.",
    options: [
      { id: "1", text: "ともだち" },
      { id: "2", text: "かぞく" },
      { id: "3", text: "きょうだい" },
      { id: "4", text: "せんせい" },
    ],
    correctAnswer: "1",
    explanation: "「友だち」is read as「ともだち」(tomodachi), meaning 'friend'.",
    explanationBreakdown: {
      vocabNotes: [
        { word: "友だち", reading: "ともだち", meaning: "friend" },
        { word: "家族", reading: "かぞく", meaning: "family" },
        { word: "兄弟", reading: "きょうだい", meaning: "siblings" },
      ],
      whyWrong: {
        "2": "「かぞく」is 家族 (family).",
        "3": "「きょうだい」is 兄弟 (brothers/siblings).",
        "4": "「せんせい」is 先生 (teacher).",
      },
    },
    difficulty: 1,
    tags: ["kanji-reading", "people"],
  },
  {
    id: "n5-v-005",
    jlptLevel: "N5",
    section: "vocab",
    category: "kanji_reading",
    mondaiNumber: 1,
    mondaiTitle: "問題１ つぎの ぶんの の ことばは どう よみますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "この テーブルの うえに <ruby>白い<rt>____</rt></ruby> はながあります。",
    promptFurigana: "この テーブルの上に <ruby>白<rt>しろ</rt></ruby>い 花があります。",
    promptTranslation: "There is a white flower on top of this table.",
    options: [
      { id: "1", text: "くろい" },
      { id: "2", text: "あかい" },
      { id: "3", text: "あおい" },
      { id: "4", text: "しろい" },
    ],
    correctAnswer: "4",
    explanation: "「白い」is read as「しろい」(shiroi), meaning 'white'.",
    explanationBreakdown: {
      vocabNotes: [
        { word: "白い", reading: "しろい", meaning: "white" },
        { word: "黒い", reading: "くろい", meaning: "black" },
        { word: "赤い", reading: "あかい", meaning: "red" },
        { word: "青い", reading: "あおい", meaning: "blue" },
      ],
      whyWrong: {
        "1": "「くろい」is 黒い (black).",
        "2": "「あかい」is 赤い (red).",
        "3": "「あおい」is 青い (blue).",
      },
    },
    difficulty: 1,
    tags: ["kanji-reading", "colors"],
  },
  {
    id: "n5-v-006",
    jlptLevel: "N5",
    section: "vocab",
    category: "kanji_reading",
    mondaiNumber: 1,
    mondaiTitle: "問題１ つぎの ぶんの の ことばは どう よみますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "テストは <ruby>午後<rt>____</rt></ruby> 二時から はじまります。",
    promptFurigana: "テストは <ruby>午後<rt>ごご</rt></ruby> 二時から 始まります。",
    promptTranslation: "The test starts at 2:00 PM.",
    options: [
      { id: "1", text: "ごぜん" },
      { id: "2", text: "ごご" },
      { id: "3", text: "しょうご" },
      { id: "4", text: "よる" },
    ],
    correctAnswer: "2",
    explanation: "「午後」is read as「ごご」(gogo), meaning 'P.M. / afternoon'.",
    explanationBreakdown: {
      vocabNotes: [
        { word: "午後", reading: "ごご", meaning: "PM / afternoon" },
        { word: "午前", reading: "ごぜん", meaning: "AM / morning" },
        { word: "正午", reading: "しょうご", meaning: "noon" },
      ],
      whyWrong: {
        "1": "「ごぜん」is 午前 (AM / morning).",
        "3": "「しょうご」is 正午 (noon).",
        "4": "「よる」is 夜 (night).",
      },
    },
    difficulty: 1,
    tags: ["kanji-reading", "time-expressions"],
  },

  // --- MONDAI 2: 表記 (Orthography - Kana to Kanji) ---
  {
    id: "n5-v-007",
    jlptLevel: "N5",
    section: "vocab",
    category: "orthography",
    mondaiNumber: 2,
    mondaiTitle: "問題２ つぎの ぶんの の ことばは どう かきますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "ノートに なまえを <ruby>かいて<rt>____</rt></ruby> ください。",
    promptFurigana: "ノートに 名前を <ruby>書<rt>か</rt></ruby>いて ください。",
    promptTranslation: "Please write your name in the notebook.",
    options: [
      { id: "1", text: "描いて" },
      { id: "2", text: "書いて" },
      { id: "3", text: "聞きて" },
      { id: "4", text: "話いて" },
    ],
    correctAnswer: "2",
    explanation: "The verb「かく」(to write text/letters) is written as「書く」. The te-form is「書いて」.",
    explanationBreakdown: {
      vocabNotes: [
        { word: "書く", reading: "かく", meaning: "to write" },
        { word: "描く", reading: "えがく / かく", meaning: "to draw/paint (pictures)" },
        { word: "聞く", reading: "きく", meaning: "to hear/listen" },
      ],
      whyWrong: {
        "1": "「描く」is used for drawing pictures (not writing names).",
        "3": "「聞きて」is an incorrect conjugation of 聞く (which is 聞いて).",
        "4": "「話いて」is an incorrect conjugation of 話す (which is 話して).",
      },
    },
    difficulty: 1,
    tags: ["orthography", "te-form", "verbs"],
  },
  {
    id: "n5-v-008",
    jlptLevel: "N5",
    section: "vocab",
    category: "orthography",
    mondaiNumber: 2,
    mondaiTitle: "問題２ つぎの ぶんの の ことばは どう かきますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "あの <ruby>みせ<rt>____</rt></ruby>で おいしい ケーキを かいました。",
    promptFurigana: "あの <ruby>店<rt>みせ</rt></ruby>で おいしい ケーキを 買いました。",
    promptTranslation: "I bought a delicious cake at that shop.",
    options: [
      { id: "1", text: "店" },
      { id: "2", text: "戸" },
      { id: "3", text: "座" },
      { id: "4", text: "広" },
    ],
    correctAnswer: "1",
    explanation: "「みせ」(shop/store) is written as「店」.",
    explanationBreakdown: {
      vocabNotes: [
        { word: "店", reading: "みせ / テン", meaning: "store/shop" },
        { word: "戸", reading: "と", meaning: "door" },
        { word: "広", reading: "ひろ(い)", meaning: "spacious" },
      ],
      whyWrong: {
        "2": "「戸」is read と (door).",
        "3": "「座」is used in 座る (すわる, to sit).",
        "4": "「広」is 広い (ひろい, spacious).",
      },
    },
    difficulty: 1,
    tags: ["orthography", "places"],
  },
  {
    id: "n5-v-009",
    jlptLevel: "N5",
    section: "vocab",
    category: "orthography",
    mondaiNumber: 2,
    mondaiTitle: "問題２ つぎの ぶんの の ことばは どう かきますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "あかい <ruby>くるま<rt>____</rt></ruby>が とまりました。",
    promptFurigana: "赤い <ruby>車<rt>くるま</rt></ruby>が 止まりました。",
    promptTranslation: "A red car stopped.",
    options: [
      { id: "1", text: "東" },
      { id: "2", text: "車" },
      { id: "3", text: "軍" },
      { id: "4", text: "重" },
    ],
    correctAnswer: "2",
    explanation: "「くるま」(car/vehicle) is written with the kanji「車」.",
    explanationBreakdown: {
      vocabNotes: [
        { word: "車", reading: "くるま / シャ", meaning: "car/vehicle" },
        { word: "東", reading: "ひがし", meaning: "east" },
        { word: "重い", reading: "おもい", meaning: "heavy" },
      ],
      whyWrong: {
        "1": "「東」means east (ひがし).",
        "3": "「軍」means military / army (ぐん).",
        "4": "「重」means heavy (おもい).",
      },
    },
    difficulty: 1,
    tags: ["orthography", "transportation"],
  },
  {
    id: "n5-v-010",
    jlptLevel: "N5",
    section: "vocab",
    category: "orthography",
    mondaiNumber: 2,
    mondaiTitle: "問題２ つぎの ぶんの の ことばは どう かきますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "あしたは がっこうの <ruby>やすみ<rt>____</rt></ruby>の ひです。",
    promptFurigana: "あしたは 学校の <ruby>休<rt>やす</rt></ruby>みの 日です。",
    promptTranslation: "Tomorrow is a school holiday (day off).",
    options: [
      { id: "1", text: "休み" },
      { id: "2", text: "体み" },
      { id: "3", text: "林み" },
      { id: "4", text: "本み" },
    ],
    correctAnswer: "1",
    explanation: "「やすみ」(holiday/rest) is written as「休み」, combining the person radical 亻 with tree 木.",
    explanationBreakdown: {
      vocabNotes: [
        { word: "休み", reading: "やすみ", meaning: "break, rest, day off" },
        { word: "体", reading: "からだ", meaning: "body" },
        { word: "林", reading: "はやし", meaning: "woods/grove" },
      ],
      whyWrong: {
        "2": "「体」means body (からだ). Notice the extra stroke inside.",
        "3": "「林」means woods (はやし).",
        "4": "「本」means book / origin (ほん).",
      },
    },
    difficulty: 1,
    tags: ["orthography", "kanji-radicals"],
  },

  // --- MONDAI 3: 文脈規定 (Contextual Vocabulary Selection) ---
  {
    id: "n5-v-011",
    jlptLevel: "N5",
    section: "vocab",
    category: "contextual_use",
    mondaiNumber: 3,
    mondaiTitle: "問題３ （　）に なにを いれますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "あつい おゆで （　）を あびました。",
    promptFurigana: "熱い お湯で （　）を 浴びました。",
    promptTranslation: "I took a ( ) with hot water.",
    options: [
      { id: "1", text: "シャワー" },
      { id: "2", text: "エレベーター" },
      { id: "3", text: "エアコン" },
      { id: "4", text: "スプーン" },
    ],
    correctAnswer: "1",
    explanation: "The collocated expression for taking a shower is「シャワーをあびる」(to take a shower).",
    explanationBreakdown: {
      vocabNotes: [
        { word: "シャワーを浴びる", reading: "シャワーをあびる", meaning: "to take a shower" },
        { word: "エレベーター", reading: "エレベーター", meaning: "elevator" },
        { word: "エアコン", reading: "エアコン", meaning: "air conditioner" },
      ],
      whyWrong: {
        "2": "「エレベーター」means elevator.",
        "3": "「エアコン」means air conditioner.",
        "4": "「スプーン」means spoon.",
      },
    },
    difficulty: 2,
    tags: ["contextual-use", "collocations", "katakana"],
  },
  {
    id: "n5-v-012",
    jlptLevel: "N5",
    section: "vocab",
    category: "contextual_use",
    mondaiNumber: 3,
    mondaiTitle: "問題３ （　）に なにを いれますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "字を まちがえたので、（　）で けしました。",
    promptFurigana: "字を 間違えたので、（　）で 消しました。",
    promptTranslation: "Because I made a mistake with a character, I erased it with an ( ).",
    options: [
      { id: "1", text: "えんぴつ" },
      { id: "2", text: "はさみ" },
      { id: "3", text: "消しゴム" },
      { id: "4", text: "カレンダー" },
    ],
    correctAnswer: "3",
    explanation: "「消しゴム」(けしゴム, eraser) is used to erase (消す) written characters.",
    explanationBreakdown: {
      vocabNotes: [
        { word: "消しゴム", reading: "けしゴム", meaning: "eraser" },
        { word: "鉛筆", reading: "えんぴつ", meaning: "pencil" },
        { word: "鋏", reading: "はさみ", meaning: "scissors" },
        { word: "消す", reading: "けす", meaning: "to erase / turn off" },
      ],
      whyWrong: {
        "1": "「えんぴつ」is a pencil used for writing, not erasing.",
        "2": "「はさみ」is scissors used for cutting.",
        "4": "「カレンダー」is a calendar.",
      },
    },
    difficulty: 2,
    tags: ["contextual-use", "stationery"],
  },
  {
    id: "n5-v-013",
    jlptLevel: "N5",
    section: "vocab",
    category: "contextual_use",
    mondaiNumber: 3,
    mondaiTitle: "問題３ （　）に なにを いれますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "きょうは かぜが つよくて （　）です。",
    promptFurigana: "今日は 風が 強くて （　）です。",
    promptTranslation: "Today the wind is strong and it is ( ).",
    options: [
      { id: "1", text: "さむい" },
      { id: "2", text: "あまい" },
      { id: "3", text: "からい" },
      { id: "4", text: "あかるい" },
    ],
    correctAnswer: "1",
    explanation: "Strong wind makes the weather cold「さむい」(samui).",
    explanationBreakdown: {
      vocabNotes: [
        { word: "寒い", reading: "さむい", meaning: "cold (weather)" },
        { word: "甘い", reading: "あまい", meaning: "sweet" },
        { word: "辛い", reading: "からい", meaning: "spicy" },
        { word: "明るい", reading: "あかるい", meaning: "bright / cheerful" },
      ],
      whyWrong: {
        "2": "「あまい」means sweet taste.",
        "3": "「からい」means spicy.",
        "4": "「あかるい」means bright.",
      },
    },
    difficulty: 2,
    tags: ["contextual-use", "adjectives", "weather"],
  },

  // --- MONDAI 4: 言い換え類義 (Paraphrasing / Synonyms) ---
  {
    id: "n5-v-014",
    jlptLevel: "N5",
    section: "vocab",
    category: "paraphrase",
    mondaiNumber: 4,
    mondaiTitle: "問題４ つぎの ぶんの の ぶんと だいたい おなじ いみの ぶんは どれですか。１・２・３・４から ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "きのうの <ruby>ゆうがた<rt>____</rt></ruby>、雨が ふりました。",
    promptFurigana: "きのうの <ruby>夕方<rt>ゆうがた</rt></ruby>、雨が 降りました。",
    promptTranslation: "It rained yesterday evening.",
    options: [
      { id: "1", text: "きのうの あさに 雨が ふりました。" },
      { id: "2", text: "きのうの ひるに 雨が ふりました。" },
      { id: "3", text: "きのうの ひぐれごろに 雨が ふりました。" },
      { id: "4", text: "きのうの よなかに 雨が ふりました。" },
    ],
    correctAnswer: "3",
    explanation: "「夕方」(ゆうがた) means late afternoon / dusk, which matches「ひぐれごろ」(around sundown / evening).",
    explanationBreakdown: {
      vocabNotes: [
        { word: "夕方", reading: "ゆうがた", meaning: "early evening / dusk" },
        { word: "日暮れ", reading: "ひぐれ", meaning: "sundown, dusk" },
        { word: "夜中", reading: "よなか", meaning: "middle of the night" },
      ],
      whyWrong: {
        "1": "「あさ」is morning.",
        "2": "「ひる」is daytime / noon.",
        "4": "「よなか」is midnight.",
      },
    },
    difficulty: 2,
    tags: ["paraphrase", "time-expressions"],
  },
  {
    id: "n5-v-015",
    jlptLevel: "N5",
    section: "vocab",
    category: "paraphrase",
    mondaiNumber: 4,
    mondaiTitle: "問題４ つぎの ぶんの の ぶんと だいたい おなじ いみの ぶんは どれですか。１・２・３・４から ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "わたしは 兄が <ruby>二人<rt>ふたり</rt></ruby> います。",
    promptFurigana: "わたしは 兄が 二人 います。",
    promptTranslation: "I have two older brothers.",
    options: [
      { id: "1", text: "わたしには おとうとが ふたり います。" },
      { id: "2", text: "わたしには おねえさんが ふたり います。" },
      { id: "3", text: "わたしには あにが ふたり います。" },
      { id: "4", text: "わたしには いもうとが ふたり います。" },
    ],
    correctAnswer: "3",
    explanation: "「兄」(あに) refers to one's own older brothers.",
    explanationBreakdown: {
      vocabNotes: [
        { word: "兄", reading: "あに", meaning: "older brother" },
        { word: "弟", reading: "おとうと", meaning: "younger brother" },
        { word: "姉", reading: "あね / おねえさん", meaning: "older sister" },
        { word: "妹", reading: "いもうと", meaning: "younger sister" },
      ],
      whyWrong: {
        "1": "「おとうと」means younger brother.",
        "2": "「おねえさん」means older sister.",
        "4": "「いもうと」means younger sister.",
      },
    },
    difficulty: 2,
    tags: ["paraphrase", "family"],
  },

  // ==========================================
  // SECTION 2: 言語知識（文法）・読解
  // ==========================================

  // --- MONDAI 5: 文法形式判断 (Grammar Form Judgments) ---
  {
    id: "n5-g-001",
    jlptLevel: "N5",
    section: "grammar",
    category: "grammar_form",
    mondaiNumber: 5,
    mondaiTitle: "問題１ （　）に なにを いれますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "わたしは としょかん（　）本を か借りました。",
    promptFurigana: "わたしは 図書館（　）本を 借りました。",
    promptTranslation: "I borrowed a book at/from the library.",
    options: [
      { id: "1", text: "で" },
      { id: "2", text: "に" },
      { id: "3", text: "を" },
      { id: "4", text: "へ" },
    ],
    correctAnswer: "1",
    explanation: "The particle「で」indicates the location where an action takes place (borrowing books at the library).",
    explanationBreakdown: {
      grammarPoints: [
        {
          title: "Location of Action: Noun (place) + で + Verb",
          explanation: "Use で to mark the location where an activity happens (図書館で本を読む/借りる).",
          example: "レストランで ご飯を食べます。",
        },
      ],
      whyWrong: {
        "2": "「に」marks existence or direction/target (e.g. 図書館に行く or 友達に借りる). When borrowing from an institution/facility as an activity venue, で is standard.",
        "3": "「を」marks the direct object (本を).",
        "4": "「へ」marks the direction of motion (図書館へ行く).",
      },
    },
    difficulty: 2,
    tags: ["particles", "particle-de", "action-location"],
  },
  {
    id: "n5-g-002",
    jlptLevel: "N5",
    section: "grammar",
    category: "grammar_form",
    mondaiNumber: 5,
    mondaiTitle: "問題１ （　）に なにを いれますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "すみません、しゃしんを（　）ください。",
    promptFurigana: "すみません、写真を（　）ください。",
    promptTranslation: "Excuse me, please take a photo.",
    options: [
      { id: "1", text: "とって" },
      { id: "2", text: "とりて" },
      { id: "3", text: "とらなくて" },
      { id: "4", text: "とった" },
    ],
    correctAnswer: "1",
    explanation: "For polite requests with 〜てください, Group 1 verb「撮る」(とる) becomes「撮って」(とって) with a small tsu促音.",
    explanationBreakdown: {
      grammarPoints: [
        {
          title: "Verb て-form + ください (Polite Request)",
          explanation: "Used to ask someone politely to do something. Group 1 verbs ending in う/つ/る conjugate to って (とる → とって).",
          example: "ちょっと待ってください。",
        },
      ],
      whyWrong: {
        "2": "「とりて」is an invalid conjugation. Verbs ending in る change to って.",
        "3": "「とらなくて」means not taking (negative te-form).",
        "4": "「とった」is plain past tense and cannot be followed by ください.",
      },
    },
    difficulty: 2,
    tags: ["te-form", "requests", "verb-conjugation"],
  },
  {
    id: "n5-g-003",
    jlptLevel: "N5",
    section: "grammar",
    category: "grammar_form",
    mondaiNumber: 5,
    mondaiTitle: "問題１ （　）に なにを いれますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "ここで たばこを すって（　）いけません。",
    promptFurigana: "ここで たばこを 吸って（　）いけません。",
    promptTranslation: "You must not smoke here.",
    options: [
      { id: "1", text: "は" },
      { id: "2", text: "も" },
      { id: "3", text: "が" },
      { id: "4", text: "に" },
    ],
    correctAnswer: "1",
    explanation: "The grammar pattern for prohibition 'must not' is「〜てはいけません」.",
    explanationBreakdown: {
      grammarPoints: [
        {
          title: "Verb て-form + は いけません (Prohibition)",
          explanation: "States a rule or strong prohibition ('You must not do X'). Note that は is pronounced 'wa'.",
          example: "ここで 写真を 撮っては いけません。",
        },
      ],
      whyWrong: {
        "2": "「〜てもいいです」is permission ('you may'), but 〜てもいけません is not standard.",
        "3": "「が」does not connect with て-form in this construction.",
        "4": "「に」is grammatically incorrect here.",
      },
    },
    difficulty: 2,
    tags: ["prohibition", "te-form-rules", "grammar-patterns"],
  },
  {
    id: "n5-g-004",
    jlptLevel: "N5",
    section: "grammar",
    category: "grammar_form",
    mondaiNumber: 5,
    mondaiTitle: "問題１ （　）に なにを いれますか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "multiple_choice",
    prompt: "日曜日は （　）しませんでした。",
    promptFurigana: "日曜日は （　）しませんでした。",
    promptTranslation: "On Sunday, I didn't do anything.",
    options: [
      { id: "1", text: "なにか" },
      { id: "2", text: "どこか" },
      { id: "3", text: "なにも" },
      { id: "4", text: "だれも" },
    ],
    correctAnswer: "3",
    explanation: "Question word + も + negative verb expresses total negation.「なにも + 否定」means 'nothing / not anything'.",
    explanationBreakdown: {
      grammarPoints: [
        {
          title: "何（なに）+ も + Negative Verb",
          explanation: "Expresses complete negation: なにも 〜ない (nothing).",
          example: "何も 食べませんでした。(I ate nothing.)",
        },
      ],
      whyWrong: {
        "1": "「なにか」means 'something' and is typically used with affirmative sentences or questions (何か食べましたか).",
        "2": "「どこか」means 'somewhere'.",
        "4": "「だれも」means 'no one / nobody' (used for people, not activities).",
      },
    },
    difficulty: 2,
    tags: ["negative-polarity", "question-words", "particles"],
  },

  // --- MONDAI 6: 文の組み立て ★ (Sentence Composition / Star Questions) ---
  {
    id: "n5-g-005",
    jlptLevel: "N5",
    section: "grammar",
    category: "sentence_order",
    mondaiNumber: 6,
    mondaiTitle: "問題２ つぎの ぶんの ★に はいる ものは どれですか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "star_order",
    prompt: "わたしは 日曜日に ____ ____ ★ ____ いきました。",
    promptFurigana: "わたしは 日曜日に ____ ____ ★ ____ 行きました。",
    promptTranslation: "I went with my friend to Tokyo by train on Sunday.",
    options: [
      { id: "1", text: "東京へ" },
      { id: "2", text: "友達と" },
      { id: "3", text: "電車で" },
      { id: "4", text: "いっしょに" },
    ],
    starOrderParts: {
      parts: [
        { id: "1", text: "東京へ" },
        { id: "2", text: "友達と" },
        { id: "3", text: "電車で" },
        { id: "4", text: "いっしょに" },
      ],
      correctOrder: ["2", "4", "3", "1"], // 友達と [2] いっしょに [4] 電車で [3] ★ 東京へ [1]
      starPosition: 3,
    },
    correctAnswer: "3",
    explanation: "Natural sentence order:「わたしは 日曜日に [友達と] [いっしょに] [★ 電車で] [東京へ] 行きました。」The 3rd position (★) is 3 (電車で).",
    explanationBreakdown: {
      grammarPoints: [
        {
          title: "Natural Japanese Clause Order",
          explanation: "Time → Companion + いっしょに → Means of transportation (で) → Destination (へ) → Motion Verb (行きました).",
          example: "日曜日に 友達と いっしょに 電車で 東京へ 行きました。",
        },
      ],
      strategyTip: "Notice that 友達と and いっしょに form a tight pair (2 → 4). 東京へ directly precedes the verb of motion 行きました (1 → 行きました). Thus the ordering is 2 4 3 1, putting 3 at position ★.",
    },
    difficulty: 3,
    tags: ["star-order", "sentence-structure", "particles"],
  },
  {
    id: "n5-g-006",
    jlptLevel: "N5",
    section: "grammar",
    category: "sentence_order",
    mondaiNumber: 6,
    mondaiTitle: "問題２ つぎの ぶんの ★に はいる ものは どれですか。１・２・３・４から いちばん いい ものを ひとつ えらんで ください。",
    questionType: "star_order",
    prompt: "テーブルの ____ ____ ★ ____ ください。",
    promptFurigana: "テーブルの ____ ____ ★ ____ ください。",
    promptTranslation: "Please put the apple on top of the table.",
    options: [
      { id: "1", text: "りんごを" },
      { id: "2", text: "上に" },
      { id: "3", text: "おいて" },
      { id: "4", text: "あかい" },
    ],
    starOrderParts: {
      parts: [
        { id: "1", text: "りんごを" },
        { id: "2", text: "上に" },
        { id: "3", text: "おいて" },
        { id: "4", text: "あかい" },
      ],
      correctOrder: ["2", "4", "1", "3"], // テーブルの [上に(2)] [あかい(4)] [★ りんごを(1)] [おいて(3)] ください。
      starPosition: 3,
    },
    correctAnswer: "1",
    explanation: "Complete sentence:「テーブルの [上に(2)] [あかい(4)] [★ りんごを(1)] [おいて(3)] ください。」The 3rd position (★) is 1 (りんごを).",
    explanationBreakdown: {
      grammarPoints: [
        {
          title: "Noun の 上に + Modified Object + 置く (to put/place)",
          explanation: "テーブルの 上に (on top of the table) + あかい りんごを (the red apple) + おいて ください (please put).",
        },
      ],
      strategyTip: "テーブルの must be followed by 上に (2). おいて connects to ください (3). あかい modifies りんごを (4 → 1). Result: 2 4 1 3. Position 3 is 1.",
    },
    difficulty: 3,
    tags: ["star-order", "adjective-modification", "requests"],
  },

  // --- MONDAI 7: 文章の文法 (Text Grammar Passage) ---
  {
    id: "n5-g-007",
    jlptLevel: "N5",
    section: "grammar",
    category: "text_grammar",
    mondaiNumber: 7,
    mondaiTitle: "問題３ つぎの ぶんしょうを よんで、文章の なかの （ １ ）に はいる いちばん いい ものを えらんで ください。",
    questionType: "multiple_choice",
    prompt: "（ １ ）に なにが はいりますか。",
    promptFurigana: null,
    promptTranslation: "What fits into blank ( 1 )?",
    passage: `わたしは 先週の日曜日に、家族と 山へ 行きました。
朝７時に 家を出ました。山の上は とても すずしかったです。
（ １ ）、景色が とても きれいでした。
みんなで お弁当を 食べました。とても たのしかったです。`,
    passageTranslation: `Last Sunday, I went to the mountains with my family.
We left home at 7:00 in the morning. On top of the mountain, it was very cool.
( 1 ), the scenery was very beautiful.
We all ate our boxed lunches together. It was very fun.`,
    options: [
      { id: "1", text: "そして" },
      { id: "2", text: "しかし" },
      { id: "3", text: "ですから" },
      { id: "4", text: "でも" },
    ],
    correctAnswer: "1",
    explanation: "The passage connects two positive descriptions of the mountain ('it was cool' AND 'the scenery was beautiful').「そして」(and / furthermore) is the correct additive conjunction.",
    explanationBreakdown: {
      grammarPoints: [
        {
          title: "Conjunction そして (And / Furthermore)",
          explanation: "Connects two coherent positive facts or events in sequence.",
          example: "部屋は 広いです。そして、きれいです。",
        },
      ],
      whyWrong: {
        "2": "「しかし」(however) denotes contrast.",
        "3": "「ですから」(therefore/because of that) denotes cause and effect.",
        "4": "「でも」(but) denotes contrast.",
      },
    },
    difficulty: 2,
    tags: ["text-grammar", "conjunctions", "passage-cohesion"],
  },

  // --- MONDAI 8: 短文読解 (Short Reading Comprehension) ---
  {
    id: "n5-r-001",
    jlptLevel: "N5",
    section: "reading",
    category: "reading_short",
    mondaiNumber: 8,
    mondaiTitle: "問題４ つぎの ぶんしょうを よんで、しつもんに こたえて ください。こたえは １・２・３・４から ひとつ えらんで ください。",
    questionType: "reading_passage",
    prompt: "田中さんは あした 何時に どこで 木村さんと あいますか。",
    promptFurigana: "田中さんは 明日 何時に どこで 木村さんと 会いますか。",
    promptTranslation: "At what time and where will Tanaka meet Kimura tomorrow?",
    passage: `木村さんへ

メモを ありがとうございます。
あしたの 土曜日、駅の 前の カフェで コーヒーを 飲みましょう。
時間は 午後３時に しましょう。
駅の 西口の かいさつの まえで まっています。

田中より`,
    passageTranslation: `To Kimura,

Thank you for your note.
Tomorrow (Saturday), let's drink coffee at the cafe in front of the station.
Let's make the time 3:00 PM.
I will be waiting in front of the station's West Ticket Gate.

From Tanaka`,
    options: [
      { id: "1", text: "午後３時に 駅の 西口の かいさつの まえ" },
      { id: "2", text: "午前３時に 駅の 東口の カフェ" },
      { id: "3", text: "午後３時に カフェの 中" },
      { id: "4", text: "午後２時に 駅の 西口" },
    ],
    correctAnswer: "1",
    explanation: "Tanaka clearly states:「時間は 午後３時に しましょう」(Let's make the time 3:00 PM) and「駅の 西口の かいさつの まえで まっています」(I'll wait in front of the West Ticket Gate of the station). Therefore, Option 1 is correct.",
    explanationBreakdown: {
      vocabNotes: [
        { word: "改札", reading: "かいさつ", meaning: "ticket barrier / gate" },
        { word: "西口", reading: "にしぐち", meaning: "west exit" },
        { word: "待つ", reading: "まつ", meaning: "to wait" },
      ],
      strategyTip: "In JLPT reading notes, watch for the exact meeting place stated in the closing sentence ('waiting in front of the west gate').",
    },
    difficulty: 2,
    tags: ["reading-short", "notes-and-messages", "information-extraction"],
  },

  // --- MONDAI 9: 中文読解 (Medium Reading Comprehension) ---
  {
    id: "n5-r-002",
    jlptLevel: "N5",
    section: "reading",
    category: "reading_mid",
    mondaiNumber: 9,
    mondaiTitle: "問題５ つぎの ぶんしょうを よんで、しつもんに こたえて ください。こたえは １・２・３・４から ひとつ えらんで ください。",
    questionType: "reading_passage",
    prompt: "リーさんは なぜ 日本へ きましたか。",
    promptFurigana: "リーさんは なぜ 日本へ 来ましたか。",
    promptTranslation: "Why did Lee come to Japan?",
    passage: `わたしは アメリカから きた リーです。
子どもの ときから 日本の アニメや まんがが だいすきでした。
高校生の ときに 日本語の べんきょうを はじめました。
大学では 日本の 歴史や 文化を もっと べんきょうしたいと おもいました。
ですから、ことしの 四月に 日本の 大学に りゅうがくするために きました。
いまは 毎日 とても いそがしいですが、あたらしい 友だちも たくさん できて、楽しいです。`,
    passageTranslation: `I am Lee from the United States.
Since childhood, I loved Japanese anime and manga.
When I was in high school, I began studying Japanese.
In college, I wanted to study Japanese history and culture more.
Therefore, in April of this year, I came to study abroad at a Japanese university.
Now, every day is very busy, but I made many new friends and it is fun.`,
    options: [
      { id: "1", text: "アニメや まんがを たくさん かうため" },
      { id: "2", text: "日本の 大学で 歴史や 文化を べんきょうするため" },
      { id: "3", text: "あたらしい 友だちと 旅行を するため" },
      { id: "4", text: "アメリカの 高校で 日本語を おしえるため" },
    ],
    correctAnswer: "2",
    explanation: "The passage states:「大学では 日本の 歴史や 文化を もっと べんきょうしたいと おもいました。ですから、ことしの 四月に 日本の 大学に りゅうがくするために きました。」(I wanted to study Japanese history and culture... therefore I came to study abroad at a Japanese university).",
    explanationBreakdown: {
      vocabNotes: [
        { word: "歴史", reading: "れきし", meaning: "history" },
        { word: "文化", reading: "ぶんか", meaning: "culture" },
        { word: "留学", reading: "りゅうがく", meaning: "study abroad" },
      ],
      whyWrong: {
        "1": "Liking anime was what started his interest as a child, not the reason for coming to university.",
        "3": "Making friends is what happened after arriving, not the primary reason.",
        "4": "He came to study in Japan, not teach in America.",
      },
    },
    difficulty: 3,
    tags: ["reading-medium", "main-idea", "reasoning"],
  },

  // --- MONDAI 10: 情報検索 (Information Retrieval - Notice/Flyer) ---
  {
    id: "n5-r-003",
    jlptLevel: "N5",
    section: "reading",
    category: "reading_info",
    mondaiNumber: 10,
    mondaiTitle: "問題６ みぎの あんないを よんで、しつもんに こたえて ください。こたえは １・２・３・４から ひとつ えらんで ください。",
    questionType: "reading_passage",
    prompt: "スミスさんは 大学生です。日曜日の 午後２時に 図書館で 本を か借りたいです。いくら はらいますか。",
    promptFurigana: "スミスさんは 大学生です。日曜日の 午後２時に 図書館で 本を 借りたいです。いくら 払いますか。",
    promptTranslation: "Smith is a university student. He wants to borrow a book at the library on Sunday at 2:00 PM. How much does he pay?",
    passage: `【 さくら市 としょかん の ごあんない 】

開館じかん（あいている じかん）：
・火曜日 〜 金曜日： 午前９時 〜 午後７時
・土曜日・日曜日： 午前１０時 〜 午後５時
・月曜日： やすみ（閉館）

利用料金（つかう おかね）：
・本を 読む・借りる： だれでも ０円（無料）
・パソコンの 利用： １時間 １００円（学生は ５０円）
※ 本は １人 ５さつまで、２しゅうかん 借りられます。`,
    passageTranslation: `【 Sakura City Library Guide 】

Opening Hours:
- Tuesday to Friday: 9:00 AM - 7:00 PM
- Saturday & Sunday: 10:00 AM - 5:00 PM
- Monday: Closed

Usage Fees:
- Reading & Borrowing books: 0 yen for everyone (Free)
- Computer usage: 100 yen for 1 hour (50 yen for students)
* Up to 5 books per person can be borrowed for 2 weeks.`,
    options: [
      { id: "1", text: "０円（むりょう）" },
      { id: "2", text: "５０円" },
      { id: "3", text: "１００円" },
      { id: "4", text: "日曜日なので 借りられない" },
    ],
    correctAnswer: "1",
    explanation: "The notice explicitly specifies:「本を 読む・借りる： だれでも ０円（無料）」(Borrowing books: 0 yen for everyone). Sunday 2:00 PM is within open hours (10:00 AM - 5:00 PM).",
    explanationBreakdown: {
      vocabNotes: [
        { word: "無料", reading: "むりょう", meaning: "free of charge" },
        { word: "開館", reading: "かいかん", meaning: "opening of a hall/library" },
        { word: "利用料金", reading: "りようりょうきん", meaning: "usage fee" },
      ],
      strategyTip: "Information retrieval questions test locating exact table rows. The 50 yen fee is only for computer usage (パソコンの利用), whereas books are free.",
    },
    difficulty: 2,
    tags: ["information-retrieval", "notices", "scanning"],
  },

  // ==========================================
  // SECTION 3: 聴解 (Listening Comprehension)
  // ==========================================

  // --- MONDAI 11: 課題理解 (Task-Based Comprehension) ---
  {
    id: "n5-l-001",
    jlptLevel: "N5",
    section: "listening",
    category: "listening_task",
    mondaiNumber: 1,
    mondaiTitle: "問題１ 課題理解（かだいりかい）\nまず しつもんを きいて ください。それから はなしを きいて、問題用紙の １から ４の なかから、いちばん いい ものを ひとつ えらんで ください。",
    questionType: "listening_comprehension",
    prompt: "男の 学生は このあと まず 何を しますか。",
    promptFurigana: "男の 学生は このあと まず 何を しますか。",
    promptTranslation: "What will the male student do FIRST after this?",
    audioScript: `【しつもん】男の 学生は このあと まず 何を しますか。

女の 先生：「山田くん、今日の 授業の レポートは もう 出しましたか。」
男の 学生：「あ、先生、すみません。いま 書いています。あと ３０分で 終わります。」
女の 先生：「そうですか。じゃあ、書き終わったら、職員室の わたしの 机の 上に 置いて くださいね。そのあと、図書館に 行って この 本を 返して きて もらえますか。」
男の 学生：「はい、わかりました。すぐに レポートを 終わらせます。」

【しつもん】男の 学生は このあと まず 何を しますか。`,
    options: [
      { id: "1", text: "レポートを 書く" },
      { id: "2", text: "職員室に 行く" },
      { id: "3", text: "図書館に 本を 返す" },
      { id: "4", text: "先生に 質問する" },
    ],
    correctAnswer: "1",
    explanation: "The student is currently writing the report and says 'I will finish the report right away'. Thus, the first action he must complete is writing the report before submitting it and returning the library book.",
    explanationBreakdown: {
      strategyTip: "Listen carefully for chronological sequence keywords: 'まず' (first), '書き終わったら' (after finishing writing), 'そのあと' (after that).",
    },
    difficulty: 2,
    tags: ["listening", "task-based", "chronology"],
  },
  {
    id: "n5-l-002",
    jlptLevel: "N5",
    section: "listening",
    category: "listening_task",
    mondaiNumber: 1,
    mondaiTitle: "問題１ 課題理解（かだいりかい）\nまず しつもんを きいて ください。それから はなしを きいて、１から ４の なかから、いちばん いい ものを ひとつ えらんで ください。",
    questionType: "listening_comprehension",
    prompt: "女の 人は あした 何を もっていきますか。",
    promptFurigana: "女の 人は 明日 何を 持って行きますか。",
    promptTranslation: "What will the woman bring tomorrow?",
    audioScript: `【しつもん】女の 人は あした 何を もっていきますか。

男の 人：「あしたの ハイキングの 準備は できましたか。」
女の 人：「はい。水筒と お弁当は 買いました。雨が 降るかもしれませんね。傘を もっていった ほうが いいですか。」
男の 人：「山の 上は 風が 強いですから、傘より レインコートの ほうが いいですよ。」
女の 人：「あ、そうですね。じゃあ、レインコートを かばんに入れます。」

【しつもん】女の 人は あした 雨のために 何を もっていきますか。`,
    options: [
      { id: "1", text: "傘（かさ）" },
      { id: "2", text: "レインコート" },
      { id: "3", text: "長靴（ながぐつ）" },
      { id: "4", text: "帽子（ぼうし）" },
    ],
    correctAnswer: "2",
    explanation: "The man advises that a raincoat is better than an umbrella due to mountain winds, and the woman agrees:「じゃあ、レインコートを かばんに入れます」(I'll put the raincoat in my bag).",
    explanationBreakdown: {
      vocabNotes: [
        { word: "水筒", reading: "すいとう", meaning: "water bottle" },
        { word: "傘", reading: "かさ", meaning: "umbrella" },
        { word: "風が強い", reading: "かぜがつよい", meaning: "wind is strong" },
      ],
    },
    difficulty: 2,
    tags: ["listening", "task-based", "preferences"],
  },

  // --- MONDAI 12: ポイント理解 (Point Comprehension) ---
  {
    id: "n5-l-003",
    jlptLevel: "N5",
    section: "listening",
    category: "listening_point",
    mondaiNumber: 2,
    mondaiTitle: "問題２ ポイント理解\nまず しつもんを きいて ください。そのあと 問題用紙を みて ください。読む 時間が あります。",
    questionType: "listening_comprehension",
    prompt: "男の 人は きのう どうして 学校を やすみましたか。",
    promptFurigana: "男の 人は きのう どうして 学校を 休みましたか。",
    promptTranslation: "Why was the man absent from school yesterday?",
    audioScript: `【しつもん】男の 人は きのう どうして 学校を やすみましたか。

女の 人：「田中くん、きのう 学校に 来なかったね。かぜを ひいたの？」
男の 人：「ううん、風邪じゃないんだ。朝 起きたら 頭が すごく 痛くて、起きられなかったんだよ。お腹も ちょっと 痛かったけど、病院で 薬を もらったら すぐ よくなったよ。」
女の 人：「そうだったんだ。たいへんだったね。もう 大丈夫？」
男の 人：「うん、もう すっかり 元気だよ。」

【しつもん】男の 人は きのう どうして 学校を やすみましたか。`,
    options: [
      { id: "1", text: "かぜを ひいたから" },
      { id: "2", text: "頭が とても 痛かったから" },
      { id: "3", text: "寝坊（ねぼう）したから" },
      { id: "4", text: "電車の 事故が あったから" },
    ],
    correctAnswer: "2",
    explanation: "The man clearly denies having a cold (「風邪じゃないんだ」) and explains that his head hurt severely (「頭が すごく 痛くて、起きられなかった」).",
    explanationBreakdown: {
      strategyTip: "The woman suggests a cold (かぜ), but the speaker directly corrects her. Listen carefully for the actual cause provided by the speaker.",
    },
    difficulty: 2,
    tags: ["listening", "point-comprehension", "health"],
  },

  // --- MONDAI 13: 発話表現 (Utterance Expressions) ---
  {
    id: "n5-l-004",
    jlptLevel: "N5",
    section: "listening",
    category: "listening_utterance",
    mondaiNumber: 3,
    mondaiTitle: "問題３ 発話表現（はつわひょうげん）\nえを みながら しつもんを きいて ください。やじるし（➡）の ひとは なんと 言いますか。１から ３の なかから、いちばん いい ものを ひとつ えらんで ください。",
    questionType: "listening_comprehension",
    prompt: "友達の 家に 入ります。何と 言いますか。",
    promptFurigana: "友達の 家に 入ります。何と 言いますか。",
    promptTranslation: "You are entering a friend's house. What do you say?",
    audioScript: `【状況】友達の 家に 遊びに 来ました。玄関で 家に 入るとき、何と 言いますか。

１：おじゃまします。
２：いってきます。
３：ごちそうさまでした。`,
    options: [
      { id: "1", text: "おじゃまします。" },
      { id: "2", text: "いってきます。" },
      { id: "3", text: "ごちそうさまでした。" },
    ],
    correctAnswer: "1",
    explanation: "When entering someone else's home as a guest, the customary greeting is「おじゃまします」(literally 'I will intrude').",
    explanationBreakdown: {
      vocabNotes: [
        { word: "おじゃまします", reading: "おじゃまします", meaning: "Excuse me for intruding (entering someone's home)" },
        { word: "いってきます", reading: "いってきます", meaning: "I'm leaving (said when leaving one's own home)" },
        { word: "ごちそうさまでした", reading: "ごちそうさまでした", meaning: "Thank you for the meal (said after eating)" },
      ],
    },
    difficulty: 1,
    tags: ["listening", "utterance-expressions", "aisatsu-greetings"],
  },
  {
    id: "n5-l-005",
    jlptLevel: "N5",
    section: "listening",
    category: "listening_utterance",
    mondaiNumber: 3,
    mondaiTitle: "問題３ 発話表現（はつわひょうげん）\nしつもんを きいて、いちばん いい あいさつを えらんで ください。",
    questionType: "listening_comprehension",
    prompt: "会社や 学校から 自分の 家へ 帰るとき、何と 言いますか。",
    promptFurigana: "会社や 学校から 自分の 家へ 帰るとき、何と 言いますか。",
    promptTranslation: "When leaving the office/school to go home, what do you say to colleagues/classmates?",
    audioScript: `【状況】仕事が 終わって、先に 帰ります。みんなに 何と 言いますか。

１：お疲れ様でした。お先に失礼します。
２：いってらっしゃい。
３：ただいま。`,
    options: [
      { id: "1", text: "お先に 失礼します。（おつかれさまでした）" },
      { id: "2", text: "いってらっしゃい。" },
      { id: "3", text: "ただいま。" },
    ],
    correctAnswer: "1",
    explanation: "When leaving before others in an office or group setting, standard Japanese etiquette is「お先に失礼します」(Excuse me for leaving before you) or「お疲れ様でした」.",
    explanationBreakdown: {
      vocabNotes: [
        { word: "お先に失礼します", reading: "おさきにしつれいします", meaning: "Pardon me for leaving ahead of you" },
        { word: "いってらっしゃい", reading: "いってらっしゃい", meaning: "Have a good day / take care (to someone leaving)" },
        { word: "ただいま", reading: "ただいま", meaning: "I'm home!" },
      ],
    },
    difficulty: 1,
    tags: ["listening", "utterance-expressions", "daily-aisatsu"],
  },

  // --- MONDAI 14: 即時応答 (Quick Response) ---
  {
    id: "n5-l-006",
    jlptLevel: "N5",
    section: "listening",
    category: "listening_quick",
    mondaiNumber: 4,
    mondaiTitle: "問題４ 即時応答（そくじおうとう）\nぶんを きいて、１から ３の なかから、いちばん いい へんじを ひとつ えらんで ください。",
    questionType: "listening_comprehension",
    prompt: "「手伝ってくれて、どうも ありがとう。」",
    promptFurigana: "「手伝ってくれて、どうも ありがとう。」",
    promptTranslation: "Prompt: 'Thank you very much for helping me.'",
    audioScript: `男の 人：「手伝ってくれて、どうも ありがとう。」

女の 人の 返事：
１：いいえ、どういたしまして。
２：はい、ありがとうございます。
３：ごめんなさい。`,
    options: [
      { id: "1", text: "いいえ、どういたしまして。" },
      { id: "2", text: "はい、ありがとうございます。" },
      { id: "3", text: "ごめんなさい。" },
    ],
    correctAnswer: "1",
    explanation: "In response to 'Thank you' (ありがとう), the natural polite response is「いいえ、どういたしまして」(You're welcome / Don't mention it).",
    explanationBreakdown: {
      whyWrong: {
        "2": "Replying 'Thank you' back is unnatural here.",
        "3": "「ごめんなさい」means I am sorry.",
      },
    },
    difficulty: 1,
    tags: ["listening", "quick-response", "polite-replies"],
  },
  {
    id: "n5-l-007",
    jlptLevel: "N5",
    section: "listening",
    category: "listening_quick",
    mondaiNumber: 4,
    mondaiTitle: "問題４ 即時応答（そくじおうとう）\nぶんを きいて、１から ３の なかから、いちばん いい へんじを ひとつ えらんで ください。",
    questionType: "listening_comprehension",
    prompt: "「コーヒー、もう いっぱい いかがですか。」",
    promptFurigana: "「コーヒー、もう 一杯 いかがですか。」",
    promptTranslation: "Prompt: 'Would you like another cup of coffee?'",
    audioScript: `女の 人：「コーヒー、もう いっぱい いかがですか。」

男の 人の 返事：
１：はい、いただきます。
２：いいえ、どういたしまして。
３：はい、いってらっしゃい。`,
    options: [
      { id: "1", text: "はい、いただきます。" },
      { id: "2", text: "いいえ、どういたしまして。" },
      { id: "3", text: "はい、いってらっしゃい。" },
    ],
    correctAnswer: "1",
    explanation: "When offered food or drinks ('Would you like another cup?'), accepting politely is done with「はい、いただきます」(Yes, please / I gratefully accept).",
    explanationBreakdown: {
      vocabNotes: [
        { word: "いかがですか", reading: "いかがですか", meaning: "How about / Would you like?" },
        { word: "いただきます", reading: "いただきます", meaning: "I humbly receive (polite dining phrase)" },
      ],
    },
    difficulty: 1,
    tags: ["listening", "quick-response", "hospitality"],
  },
];

// ==========================================
// SAMPLE N4 & N3 QUESTIONS (Extensibility validation)
// ==========================================
export const SAMPLE_N4_QUESTIONS: Question[] = [
  {
    id: "n4-v-001",
    jlptLevel: "N4",
    section: "vocab",
    category: "kanji_reading",
    mondaiNumber: 1,
    mondaiTitle: "問題１ つぎの ぶんの の ことばは どう よみますか。",
    questionType: "multiple_choice",
    prompt: "来週の 旅行の <ruby>予定<rt>____</rt></ruby>を たてました。",
    promptFurigana: "来週の 旅行の <ruby>予定<rt>よてい</rt></ruby>を 立てました。",
    promptTranslation: "I made plans for next week's trip.",
    options: [
      { id: "1", text: "よてい" },
      { id: "2", text: "よてん" },
      { id: "3", text: "よじょう" },
      { id: "4", text: "ゆてい" },
    ],
    correctAnswer: "1",
    explanation: "「予定」is read as「よてい」(yotei), meaning plan/schedule.",
    explanationBreakdown: {
      vocabNotes: [{ word: "予定", reading: "よてい", meaning: "plan, schedule" }],
    },
    difficulty: 2,
    tags: ["n4", "kanji-reading", "plans"],
  },
  {
    id: "n4-g-001",
    jlptLevel: "N4",
    section: "grammar",
    category: "grammar_form",
    mondaiNumber: 5,
    mondaiTitle: "問題１ （　）に なにを いれますか。",
    questionType: "multiple_choice",
    prompt: "雨が （　）そうですから、傘を 持っていきましょう。",
    promptFurigana: "雨が （　）そうですから、傘を 持って行きましょう。",
    promptTranslation: "It looks like it will rain, so let's bring an umbrella.",
    options: [
      { id: "1", text: "ふり" },
      { id: "2", text: "ふる" },
      { id: "3", text: "ふって" },
      { id: "4", text: "ふった" },
    ],
    correctAnswer: "1",
    explanation: "Verb Stem + そうです expresses conjecture based on visual appearance ('looks like X is about to happen'). 降る (to rain) stem is 降り (ふり).",
    explanationBreakdown: {
      grammarPoints: [
        {
          title: "Verb Stem + そうです (Conjecture / Looks like)",
          explanation: "Used when something appears about to happen. 降る → 降りそうです.",
        },
      ],
    },
    difficulty: 3,
    tags: ["n4", "grammar-form", "soodesu-conjecture"],
  },
];

export const SAMPLE_N3_QUESTIONS: Question[] = [
  {
    id: "n3-v-001",
    jlptLevel: "N3",
    section: "vocab",
    category: "kanji_reading",
    mondaiNumber: 1,
    mondaiTitle: "問題１ つぎの ぶんの の ことばは どう よみますか。",
    questionType: "multiple_choice",
    prompt: "この 工場では 最新の ロボットを <ruby>製造<rt>____</rt></ruby>しています。",
    promptFurigana: "この 工場では 最新の ロボットを <ruby>製造<rt>せいぞう</rt></ruby>しています。",
    promptTranslation: "This factory manufactures state-of-the-art robots.",
    options: [
      { id: "1", text: "せいぞう" },
      { id: "2", text: "しょうぞう" },
      { id: "3", text: "せいさく" },
      { id: "4", text: "そうぞう" },
    ],
    correctAnswer: "1",
    explanation: "「製造」is read as「せいぞう」(seizou, manufacturing / production).",
    explanationBreakdown: {
      vocabNotes: [{ word: "製造", reading: "せいぞう", meaning: "manufacturing, production" }],
    },
    difficulty: 3,
    tags: ["n3", "kanji-reading", "manufacturing"],
  },
];

// Combine all questions
export const ALL_SEED_QUESTIONS: Question[] = [
  ...SAMPLE_N5_QUESTIONS,
  ...SAMPLE_N4_QUESTIONS,
  ...SAMPLE_N3_QUESTIONS,
];

// Pre-defined Official JLPT N5 Sample Mock Test Model
export const SEED_JLPT_TESTS: JLPTTestModel[] = [
  {
    id: "jlpt-n5-mock-01",
    title: "JLPT N5 Official Sample Mock Exam 1",
    jlptLevel: "N5",
    code: "JLPT-N5-MOCK-01",
    description: "Standard full-length JLPT N5 examination conforming to the Japan Foundation & JEES official test specification with all 14 Mondai sections.",
    totalDurationMinutes: 90,
    passingScore: 80,
    totalScore: 180,
    sectionDurations: {
      language_knowledge_reading: 60,
      listening: 30,
    },
    sectionConfigs: {
      language_knowledge_reading: {
        title: "言語知識（文字・語彙・文法）・読解 (Language Knowledge & Reading)",
        maxScore: 120,
        passScore: 38,
        durationMinutes: 60,
        mondaiList: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      },
      listening: {
        title: "聴解 (Listening Comprehension)",
        maxScore: 60,
        passScore: 19,
        durationMinutes: 30,
        mondaiList: [1, 2, 3, 4],
      },
    },
  },
  {
    id: "jlpt-n5-vocab-grammar-sprint",
    title: "JLPT N5 Language Knowledge & Grammar Power Drill",
    jlptLevel: "N5",
    code: "JLPT-N5-SPRINT-01",
    description: "Targeted 30-minute sprint focusing on Kanji reading, orthography, essential particles, and star composition.",
    totalDurationMinutes: 30,
    passingScore: 70,
    totalScore: 100,
    sectionDurations: {
      vocab_grammar: 30,
    },
    sectionConfigs: {
      vocab_grammar: {
        title: "文字・語彙・文法 Drill",
        maxScore: 100,
        passScore: 70,
        durationMinutes: 30,
        mondaiList: [1, 2, 3, 4, 5, 6],
      },
    },
  },
  {
    id: "jlpt-n4-mock-preview",
    title: "JLPT N4 Starter Diagnostic Test",
    jlptLevel: "N4",
    code: "JLPT-N4-PREVIEW-01",
    description: "N4 elementary level sample benchmark evaluating transitional grammar, complex adjectives, and conversational comprehension.",
    totalDurationMinutes: 60,
    passingScore: 90,
    totalScore: 180,
    sectionDurations: {
      language_knowledge_reading: 40,
      listening: 20,
    },
    sectionConfigs: {
      language_knowledge_reading: {
        title: "Language Knowledge & Reading",
        maxScore: 120,
        passScore: 38,
        durationMinutes: 40,
        mondaiList: [1, 5],
      },
      listening: {
        title: "Listening",
        maxScore: 60,
        passScore: 19,
        durationMinutes: 20,
        mondaiList: [1],
      },
    },
  },
];
