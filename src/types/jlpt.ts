import { JLPTLevel, Question } from "./quiz";

export interface JLPTSectionConfig {
  key: string;
  title: string;
  titleJapanese: string;
  durationMinutes: number;
  maxScore: number;
  passScore: number;
  mondaiList: Array<{
    number: number;
    title: string;
    description: string;
    questionCount: number;
    category: string;
  }>;
}

export interface JLPTLevelSpec {
  level: JLPTLevel;
  title: string;
  description: string;
  totalDurationMinutes: number;
  passingScore: number;
  totalScore: number;
  sections: JLPTSectionConfig[];
}

export const OFFICIAL_JLPT_SPECS: Record<JLPTLevel, JLPTLevelSpec> = {
  N5: {
    level: "N5",
    title: "JLPT N5 (Beginner Foundation)",
    description: "Ability to understand some basic Japanese, read typical hiragana, katakana, and daily N5 kanji, and comprehend slow, short classroom conversations.",
    totalDurationMinutes: 90,
    passingScore: 80,
    totalScore: 180,
    sections: [
      {
        key: "language_knowledge_reading",
        title: "Language Knowledge (Vocab/Grammar) & Reading",
        titleJapanese: "言語知識（文字・語彙・文法）・読解",
        durationMinutes: 60,
        maxScore: 120,
        passScore: 38,
        mondaiList: [
          { number: 1, title: "Kanji Reading (漢字読み)", description: "Read kanji in context", questionCount: 6, category: "kanji_reading" },
          { number: 2, title: "Orthography (表記)", description: "Choose kanji for kana words", questionCount: 6, category: "orthography" },
          { number: 3, title: "Contextual Word Use (文脈規定)", description: "Fill the most suitable vocabulary word", questionCount: 5, category: "contextual_use" },
          { number: 4, title: "Paraphrases (言い換え類義)", description: "Choose sentence with similar meaning", questionCount: 4, category: "paraphrase" },
          { number: 5, title: "Grammar Forms (文法形式判断)", description: "Select suitable particle or verb conjugation", questionCount: 8, category: "grammar_form" },
          { number: 6, title: "Sentence Composition (文の組み立て ★)", description: "Order 4 parts and find the star part", questionCount: 4, category: "sentence_order" },
          { number: 7, title: "Text Grammar (文章の文法)", description: "Passage fill-in-the-blank for grammar flow", questionCount: 3, category: "text_grammar" },
          { number: 8, title: "Short Reading (短文読解)", description: "Comprehend short notes or messages", questionCount: 2, category: "reading_short" },
          { number: 9, title: "Medium Reading (中文読解)", description: "Comprehend 250-word passage", questionCount: 1, category: "reading_mid" },
          { number: 10, title: "Information Retrieval (情報検索)", description: "Extract key facts from notices or signs", questionCount: 1, category: "reading_info" },
        ],
      },
      {
        key: "listening",
        title: "Listening Comprehension",
        titleJapanese: "聴解",
        durationMinutes: 30,
        maxScore: 60,
        passScore: 19,
        mondaiList: [
          { number: 1, title: "Task-Based Comprehension (課題理解)", description: "Listen to conversation and identify next action", questionCount: 4, category: "listening_task" },
          { number: 2, title: "Point Comprehension (ポイント理解)", description: "Extract key specific information", questionCount: 4, category: "listening_point" },
          { number: 3, title: "Utterance Expressions (発話表現)", description: "Select appropriate greeting/phrase for situation", questionCount: 3, category: "listening_utterance" },
          { number: 4, title: "Quick Response (即時応答)", description: "Select fastest natural reply to short prompt", questionCount: 4, category: "listening_quick" },
        ],
      },
    ],
  },
  N4: {
    level: "N4",
    title: "JLPT N4 (Elementary)",
    description: "Ability to understand basic Japanese used in everyday situations, comprehend short passages on familiar topics, and follow daily spoken conversations.",
    totalDurationMinutes: 115,
    passingScore: 90,
    totalScore: 180,
    sections: [
      {
        key: "language_knowledge_reading",
        title: "Language Knowledge & Reading",
        titleJapanese: "言語知識（文字・語彙・文法）・読解",
        durationMinutes: 80,
        maxScore: 120,
        passScore: 38,
        mondaiList: [
          { number: 1, title: "Kanji Reading", description: "Read N4 kanji", questionCount: 6, category: "kanji_reading" },
          { number: 2, title: "Orthography", description: "Choose kanji for words", questionCount: 6, category: "orthography" },
          { number: 3, title: "Contextual Use", description: "Select vocabulary", questionCount: 6, category: "contextual_use" },
          { number: 4, title: "Paraphrases", description: "Synonymous sentences", questionCount: 4, category: "paraphrase" },
          { number: 5, title: "Grammar Forms", description: "N4 particles and conjugations", questionCount: 8, category: "grammar_form" },
          { number: 6, title: "Sentence Order ★", description: "Rearrange scrambled sentence", questionCount: 4, category: "sentence_order" },
          { number: 7, title: "Reading Passages", description: "Short & Medium text comprehension", questionCount: 4, category: "reading_short" },
        ],
      },
      {
        key: "listening",
        title: "Listening Comprehension",
        titleJapanese: "聴解",
        durationMinutes: 35,
        maxScore: 60,
        passScore: 19,
        mondaiList: [
          { number: 1, title: "Task-Based Listening", description: "Determine actions", questionCount: 4, category: "listening_task" },
          { number: 2, title: "Quick Response", description: "Immediate replies", questionCount: 4, category: "listening_quick" },
        ],
      },
    ],
  },
  N3: {
    level: "N3",
    title: "JLPT N3 (Intermediate Bridge)",
    description: "Ability to understand Japanese used in everyday situations to a certain degree, grasping main points of newspaper headlines and slightly natural-speed conversations.",
    totalDurationMinutes: 140,
    passingScore: 95,
    totalScore: 180,
    sections: [
      {
        key: "language_knowledge_vocab",
        title: "Language Knowledge (Vocabulary)",
        titleJapanese: "言語知識（文字・語彙）",
        durationMinutes: 30,
        maxScore: 60,
        passScore: 19,
        mondaiList: [
          { number: 1, title: "Kanji Reading", description: "Read intermediate kanji", questionCount: 6, category: "kanji_reading" },
          { number: 2, title: "Word Formation & Usage", description: "Contextual vocabulary", questionCount: 6, category: "contextual_use" },
        ],
      },
      {
        key: "language_knowledge_grammar_reading",
        title: "Grammar & Reading",
        titleJapanese: "言語知識（文法）・読解",
        durationMinutes: 70,
        maxScore: 60,
        passScore: 19,
        mondaiList: [
          { number: 1, title: "Grammar Judgments", description: "Complex grammar patterns", questionCount: 6, category: "grammar_form" },
          { number: 2, title: "Reading Comprehension", description: "Intermediate articles & essays", questionCount: 4, category: "reading_mid" },
        ],
      },
      {
        key: "listening",
        title: "Listening Comprehension",
        titleJapanese: "聴解",
        durationMinutes: 40,
        maxScore: 60,
        passScore: 19,
        mondaiList: [
          { number: 1, title: "Task & Point Comprehension", description: "Intermediate audio tracks", questionCount: 6, category: "listening_task" },
        ],
      },
    ],
  },
  N2: {
    level: "N2",
    title: "JLPT N2 (Pre-Advanced)",
    description: "Ability to comprehend Japanese in a broad range of everyday scenarios, business communications, commentary, and news broadcasts.",
    totalDurationMinutes: 155,
    passingScore: 90,
    totalScore: 180,
    sections: [
      {
        key: "language_knowledge_reading",
        title: "Language Knowledge & Reading",
        titleJapanese: "言語知識（文字・語彙・文法）・読解",
        durationMinutes: 105,
        maxScore: 120,
        passScore: 38,
        mondaiList: [],
      },
      {
        key: "listening",
        title: "Listening Comprehension",
        titleJapanese: "聴解",
        durationMinutes: 50,
        maxScore: 60,
        passScore: 19,
        mondaiList: [],
      },
    ],
  },
  N1: {
    level: "N1",
    title: "JLPT N1 (Advanced Native-Fluent)",
    description: "Ability to comprehend Japanese used in a wide variety of complex academic, professional, nuanced, and abstract situations.",
    totalDurationMinutes: 170,
    passingScore: 100,
    totalScore: 180,
    sections: [
      {
        key: "language_knowledge_reading",
        title: "Language Knowledge & Reading",
        titleJapanese: "言語知識（文字・語彙・文法）・読解",
        durationMinutes: 110,
        maxScore: 120,
        passScore: 38,
        mondaiList: [],
      },
      {
        key: "listening",
        title: "Listening Comprehension",
        titleJapanese: "聴解",
        durationMinutes: 60,
        maxScore: 60,
        passScore: 19,
        mondaiList: [],
      },
    ],
  },
};

export interface JLPTTestModel {
  id: string;
  title: string;
  jlptLevel: JLPTLevel;
  code: string;
  description: string;
  totalDurationMinutes: number;
  sectionDurations: Record<string, number>;
  passingScore: number;
  totalScore: number;
  sectionConfigs: Record<string, {
    title: string;
    maxScore: number;
    passScore: number;
    durationMinutes: number;
    mondaiList: number[];
  }>;
  questions?: Question[];
  questionCount?: number;
}
