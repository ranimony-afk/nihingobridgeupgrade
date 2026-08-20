/**
 * ListeningService — Audio delivery and listening question management.
 *
 * P41: Delivers audio content and generates/grades listening exercises.
 *
 * Audio sources:
 *   1. Sentence audio (sentences.audio_ref → file URL or TTS ID)
 *   2. Lesson audio items (lesson_items type='audio')
 *   3. Generated listening exercises (quiz engine listen_type)
 *   4. Dialogue audio (structured conversations for listening practice)
 *
 * Audio delivery:
 *   - Audio files are served from /audio/ or an external CDN
 *   - TTS can be generated on-demand for sentences without pre-recorded audio
 *   - Playback speed control is a client concern (0.5x, 1x, 1.5x)
 *
 * Question types for listening:
 *   - dictation:         Listen → type what you hear (full sentence)
 *   - word_recognition:  Listen → identify the word spoken
 *   - comprehension:     Listen to dialogue → answer about content
 *   - fill_audio_blank:  Listen → fill in the missing word
 *   - shadow:            Listen → repeat (graded by timing, not content)
 */

import { eq, and, asc, sql, isNull, not } from "drizzle-orm";
import { db } from "@/db";
import {
  sentences,
  sentenceTranslations,
  dictionaryEntries,
  lessonItems,
} from "@/db/schema";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** An audio clip ready for playback. */
export interface AudioClip {
  id: string;
  /** URL to the audio file (relative or absolute). */
  src: string;
  /** MIME type. */
  mimeType: string;
  /** Duration in seconds (null if unknown). */
  duration: number | null;
  /** Label for display. */
  label: string | null;
  /** Full transcript of what's spoken. */
  transcript: string;
  /** Translation of the transcript. */
  translation: string | null;
  /** Playback speed options supported. */
  speeds: number[];
  /** Source type: "file", "tts", "dialogue". */
  sourceType: "file" | "tts" | "dialogue";
}

/** A listening exercise ready for the client. */
export interface ListeningExercise {
  id: string;
  type: "dictation" | "word_recognition" | "comprehension" | "fill_audio_blank" | "shadow";
  /** Audio clip to play. */
  audio: AudioClip;
  /** The question prompt (shown after/during audio). */
  prompt: string;
  /** Options for multiple-choice listening questions. */
  options: string[] | null;
  /** Sentence with blank for fill_audio_blank. */
  sentenceWithBlank: string | null;
  /** Points for this exercise. */
  points: number;
  /** Hint text. */
  hint: string | null;
  /** Number of times the audio can be replayed (0 = unlimited). */
  maxReplays: number;
  /** Associated knowledge references. */
  knowledgeRef: string | null;
}

/** Server-side exercise with answer data (not sent to client). */
export interface ListeningExerciseFull extends ListeningExercise {
  _answer: string;
  _accepted: string[];
  _explanation: string;
}

/** Result of grading a listening answer. */
export interface ListeningGradeResult {
  exerciseId: string;
  type: string;
  correct: boolean;
  pointsEarned: number;
  pointsPossible: number;
  correctAnswer: string;
  userAnswer: string;
  explanation: string;
}

/** A structured dialogue for listening practice. */
export interface Dialogue {
  id: string;
  title: string;
  description: string;
  level: number;
  /** Audio URL for the full dialogue. */
  audioSrc: string | null;
  /** Individual lines with speaker, text, translation. */
  lines: DialogueLine[];
  /** Comprehension questions about the dialogue. */
  questions: ListeningExercise[];
}

export interface DialogueLine {
  speaker: string;
  japanese: string;
  reading: string | null;
  translation: string;
  /** Timestamp in seconds for this line within the audio. */
  startTime: number | null;
}

/** A listening practice set. */
export interface ListeningPracticeSet {
  exercises: ListeningExercise[];
  totalExercises: number;
  totalPoints: number;
  estimatedMinutes: number;
}

// ─────────────────────────────────────────────
// TTS helpers
// ─────────────────────────────────────────────

/**
 * Generate a TTS audio URL for a Japanese sentence.
 * In production, this would call a TTS API (Google Cloud TTS, Amazon Polly, etc.)
 * or return a pre-generated file path.
 *
 * For now, returns a placeholder URL that the client can use with
 * the Web Speech API or a client-side TTS library.
 */
function ttsUrl(text: string): string {
  // Placeholder: encode text into a URL that a TTS endpoint would serve
  const encoded = encodeURIComponent(text);
  return `/api/v2/audio/tts?text=${encoded}&lang=ja&speed=1.0`;
}

function buildAudioClip(
  id: string,
  japanese: string,
  translation: string | null,
  audioRef: string | null,
  label?: string,
): AudioClip {
  const hasPrecorded = audioRef && !audioRef.startsWith("/api/");
  return {
    id,
    src: audioRef ?? ttsUrl(japanese),
    mimeType: "audio/mpeg",
    duration: null,
    label: label ?? null,
    transcript: japanese,
    translation,
    speeds: [0.5, 0.75, 1.0, 1.25],
    sourceType: hasPrecorded ? "file" : "tts",
  };
}

// ─────────────────────────────────────────────
// ListeningService
// ─────────────────────────────────────────────

export const ListeningService = {

  // ═══════════════════════════════════════════
  // AUDIO DELIVERY
  // ═══════════════════════════════════════════

  /** Get an audio clip for a sentence by ID. */
  async getAudioForSentence(sentenceId: string): Promise<AudioClip | null> {
    const [row] = await db.select().from(sentences)
      .where(eq(sentences.id, sentenceId)).limit(1);
    if (!row) return null;

    const trans = await db.select({ translation: sentenceTranslations.translation })
      .from(sentenceTranslations)
      .where(and(eq(sentenceTranslations.sentenceId, sentenceId), eq(sentenceTranslations.lang, "en")))
      .limit(1);

    return buildAudioClip(
      `audio-${sentenceId}`,
      row.japanese,
      trans[0]?.translation ?? null,
      row.audioRef,
      `Sentence #${row.sourceId}`,
    );
  },

  /** Get audio clips for a vocabulary word (the word + example sentences). */
  async getAudioForWord(entryId: string): Promise<AudioClip[]> {
    const [entry] = await db.select().from(dictionaryEntries)
      .where(eq(dictionaryEntries.id, entryId)).limit(1);
    if (!entry) return [];

    const clips: AudioClip[] = [];

    // Word pronunciation
    clips.push(buildAudioClip(
      `audio-word-${entryId}`,
      entry.headword,
      null,
      null,
      `${entry.headword} (${entry.reading})`,
    ));

    // Example sentences with this word
    const exSentences = await db.select().from(sentences)
      .where(eq(sentences.dictionaryEntryId, entryId))
      .limit(3);

    for (const s of exSentences) {
      const trans = await db.select({ translation: sentenceTranslations.translation })
        .from(sentenceTranslations)
        .where(and(eq(sentenceTranslations.sentenceId, s.id), eq(sentenceTranslations.lang, "en")))
        .limit(1);
      clips.push(buildAudioClip(
        `audio-ex-${s.id}`,
        s.japanese,
        trans[0]?.translation ?? null,
        s.audioRef,
        "Example sentence",
      ));
    }

    return clips;
  },

  // ═══════════════════════════════════════════
  // EXERCISE GENERATION
  // ═══════════════════════════════════════════

  /** Generate a dictation exercise: listen → type what you hear. */
  dictation(sentence: string, translation: string, audioRef?: string): ListeningExerciseFull {
    const id = genId("lex");
    return {
      id, type: "dictation",
      audio: buildAudioClip(`audio-${id}`, sentence, translation, audioRef ?? null),
      prompt: "Listen carefully and type exactly what you hear.",
      options: null, sentenceWithBlank: null,
      points: 3, hint: `Translation: ${translation}`,
      maxReplays: 3, knowledgeRef: null,
      _answer: sentence,
      _accepted: [sentence.replace(/[。、！？]/g, "")],
      _explanation: `The audio says: ${sentence} — "${translation}"`,
    };
  },

  /** Generate a word recognition exercise: listen → pick the word you heard. */
  wordRecognition(word: string, reading: string, distractors: string[], audioRef?: string): ListeningExerciseFull {
    const id = genId("lex");
    const options = [...distractors, word].sort(() => Math.random() - 0.5);
    return {
      id, type: "word_recognition",
      audio: buildAudioClip(`audio-${id}`, word, null, audioRef ?? null, word),
      prompt: "Which word did you hear?",
      options, sentenceWithBlank: null,
      points: 1, hint: `Reading: ${reading}`,
      maxReplays: 2, knowledgeRef: null,
      _answer: word,
      _accepted: [word, reading],
      _explanation: `The word spoken was ${word} (${reading}).`,
    };
  },

  /** Generate a comprehension exercise: listen to sentence → answer about meaning. */
  comprehension(
    sentence: string, translation: string,
    question: string, correctAnswer: string,
    distractors: string[], audioRef?: string,
  ): ListeningExerciseFull {
    const id = genId("lex");
    const options = [...distractors, correctAnswer].sort(() => Math.random() - 0.5);
    return {
      id, type: "comprehension",
      audio: buildAudioClip(`audio-${id}`, sentence, translation, audioRef ?? null),
      prompt: question,
      options, sentenceWithBlank: null,
      points: 2, hint: null,
      maxReplays: 3, knowledgeRef: null,
      _answer: correctAnswer,
      _accepted: [correctAnswer],
      _explanation: `${sentence} means "${translation}". The answer is: ${correctAnswer}.`,
    };
  },

  /** Generate a fill-blank listening exercise: listen → fill in the missing word. */
  fillAudioBlank(
    fullSentence: string, blankWord: string, translation: string,
    distractors: string[], audioRef?: string,
  ): ListeningExerciseFull {
    const id = genId("lex");
    const withBlank = fullSentence.replace(blankWord, "＿＿＿");
    const options = [...distractors, blankWord].sort(() => Math.random() - 0.5);
    return {
      id, type: "fill_audio_blank",
      audio: buildAudioClip(`audio-${id}`, fullSentence, translation, audioRef ?? null),
      prompt: "Listen and fill in the blank:",
      options, sentenceWithBlank: withBlank,
      points: 2, hint: `Translation: ${translation}`,
      maxReplays: 3, knowledgeRef: null,
      _answer: blankWord,
      _accepted: [blankWord],
      _explanation: `The full sentence is: ${fullSentence} — "${translation}"`,
    };
  },

  /** Generate a shadow exercise: listen → repeat. */
  shadow(sentence: string, translation: string, audioRef?: string): ListeningExerciseFull {
    const id = genId("lex");
    return {
      id, type: "shadow",
      audio: buildAudioClip(`audio-${id}`, sentence, translation, audioRef ?? null),
      prompt: "Listen and repeat the sentence out loud. Press ✓ when done.",
      options: null, sentenceWithBlank: null,
      points: 1, hint: `${sentence} — "${translation}"`,
      maxReplays: 0, knowledgeRef: null,
      _answer: sentence,
      _accepted: [sentence],
      _explanation: `${sentence} — "${translation}"`,
    };
  },

  // ═══════════════════════════════════════════
  // PRACTICE SET GENERATION
  // ═══════════════════════════════════════════

  /** Generate a listening practice set from available sentences. */
  async generatePractice(opts?: { jlpt?: number; count?: number }): Promise<ListeningPracticeSet> {
    const count = opts?.count ?? 5;
    const conds = [];
    if (opts?.jlpt) conds.push(eq(sentences.jlptLevel, opts.jlpt));

    const sentenceRows = await db.select().from(sentences)
      .where(conds.length > 0 ? and(...conds) : undefined)
      .orderBy(sql`RANDOM()`)
      .limit(count);

    const exercises: ListeningExercise[] = [];

    for (const row of sentenceRows) {
      const trans = await db.select({ translation: sentenceTranslations.translation })
        .from(sentenceTranslations)
        .where(and(eq(sentenceTranslations.sentenceId, row.id), eq(sentenceTranslations.lang, "en")))
        .limit(1);
      const translation = trans[0]?.translation ?? "";

      // Vary exercise types
      const roll = Math.random();
      let exercise: ListeningExerciseFull;

      if (roll < 0.35) {
        exercise = this.dictation(row.japanese, translation, row.audioRef ?? undefined);
      } else if (roll < 0.55) {
        // Comprehension
        exercise = this.comprehension(
          row.japanese, translation,
          "What does this sentence mean?",
          translation,
          ["I went to the store.", "The weather is nice.", "Please wait a moment."],
          row.audioRef ?? undefined,
        );
      } else if (roll < 0.75) {
        // Extract a word to blank
        const words = row.japanese.replace(/[。、！？]/g, "").split("");
        if (words.length > 4) {
          // Pick a kanji-containing segment
          const kanjiWord = words.find((w) => /[\u4E00-\u9FFF]/.test(w)) ?? words[1] ?? "?";
          exercise = this.fillAudioBlank(
            row.japanese, kanjiWord, translation,
            ["私", "今日", "学校"],
            row.audioRef ?? undefined,
          );
        } else {
          exercise = this.dictation(row.japanese, translation, row.audioRef ?? undefined);
        }
      } else {
        exercise = this.shadow(row.japanese, translation, row.audioRef ?? undefined);
      }

      // Strip answer for client
      const { _answer, _accepted, _explanation, ...clientSafe } = exercise;
      exercises.push(clientSafe);
    }

    return {
      exercises,
      totalExercises: exercises.length,
      totalPoints: exercises.reduce((sum, e) => sum + e.points, 0),
      estimatedMinutes: Math.ceil(exercises.length * 1.5),
    };
  },

  // ═══════════════════════════════════════════
  // GRADING
  // ═══════════════════════════════════════════

  /** Grade a listening exercise answer. */
  grade(exercise: ListeningExerciseFull, userAnswer: string): ListeningGradeResult {
    const norm = (s: string) => s.trim().toLowerCase().replace(/[。、！？.!?,\s]/g, "");
    const correct = norm(userAnswer) === norm(exercise._answer)
      || exercise._accepted.some((a) => norm(userAnswer) === norm(a));

    return {
      exerciseId: exercise.id,
      type: exercise.type,
      correct,
      pointsEarned: correct ? exercise.points : 0,
      pointsPossible: exercise.points,
      correctAnswer: exercise._answer,
      userAnswer,
      explanation: exercise._explanation,
    };
  },

  // ═══════════════════════════════════════════
  // DIALOGUE BUILDER
  // ═══════════════════════════════════════════

  /** Build a dialogue from structured data. */
  buildDialogue(
    id: string,
    title: string,
    description: string,
    level: number,
    lines: DialogueLine[],
    audioSrc?: string,
  ): Dialogue {
    // Generate comprehension questions from dialogue content
    const dialogueQuestions: ListeningExercise[] = [];

    if (lines.length >= 2) {
      // Who said what?
      const line = lines[0]!;
      const qId = genId("dq");
      dialogueQuestions.push({
        id: qId, type: "comprehension",
        audio: buildAudioClip(`audio-${qId}`, line.japanese, line.translation, audioSrc ?? null),
        prompt: `What did ${line.speaker} say?`,
        options: [line.translation, "Goodbye", "Thank you", "I'm sorry"].sort(() => Math.random() - 0.5),
        sentenceWithBlank: null, points: 2, hint: null,
        maxReplays: 3, knowledgeRef: null,
      });
    }

    return {
      id, title, description, level,
      audioSrc: audioSrc ?? null,
      lines,
      questions: dialogueQuestions,
    };
  },
};
