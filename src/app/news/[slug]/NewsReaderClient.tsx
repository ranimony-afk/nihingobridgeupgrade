"use client";

import React, { useState } from "react";
import Link from "next/link";

export interface NewsArticleData {
  id: number;
  slug: string;
  title: string;
  summary: string;
  japaneseText: string;
  furiganaText?: string | null;
  englishTranslation: string;
  tamilTranslation?: string | null;
  malayalamTranslation?: string | null;
  difficultyLevel: string;
  readingMinutes: number;
  audioUrl?: string | null;
  grammarHighlights?: string[] | null;
  extractedVocabulary?: Array<{ japanese: string; furigana: string; meaning: string }> | null;
  extractedKanji?: Array<{ kanji: string; meaning: string; strokes: number }> | null;
  comprehensionQuestions?: Array<{ question: string; options: string[]; correctIndex: number; explanation: string }> | null;
}

export function NewsReaderClient({ article }: { article: NewsArticleData }) {
  const [showFurigana, setShowFurigana] = useState(true);
  const [selectedLang, setSelectedLang] = useState<"en" | "ta" | "ml">("en");
  const [bookmarked, setBookmarked] = useState(false);
  const [markedRead, setMarkedRead] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [savedVocab, setSavedVocab] = useState<string[]>([]);

  const toggleSaveVocab = (word: string) => {
    setSavedVocab((s) => (s.includes(word) ? s.filter((w) => w !== word) : [...s, word]));
  };

  // 1. Audio Speed and Playback
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // 2. Reading Speed Tracker (WPM)
  const [wpm, setWpm] = useState(120); // default target reading speed
  const charCount = article.japaneseText.length;
  const estimatedReadMins = Math.round(charCount / wpm) || 1;

  // 3. Dictionary Popup / Takoboto Popover State
  const [popupWord, setPopupWord] = useState<{ japanese: string; furigana: string; meaning: string } | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  // 4. Team Notes & Discussion Board Thread
  const [comments, setComments] = useState([
    { author: "Kenji S.", body: "The particle 「ごろ」 here indicates an approximate time around March 20th. Very useful!", date: "2 Hours ago" },
    { author: "Michael (You)", body: "Perfect shadowing exercise. Listening speed at 0.75x is great for N5 learners.", date: "Just now" }
  ]);
  const [newComment, setNewComment] = useState("");

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setComments((prev) => [
      ...prev,
      { author: "Michael (You)", body: newComment.trim(), date: "Just now" }
    ]);
    setNewComment("");
  };

  const triggerDictPopup = (word: string, furigana: string, meaning: string) => {
    setPopupWord({ japanese: word, furigana, meaning });
    setIsPopupOpen(true);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto font-sans">
      {/* 1. Reader Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm border border-black/5 text-xs font-semibold">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFurigana(!showFurigana)}
            className={`rounded-lg px-3 py-1.5 transition cursor-pointer ${
              showFurigana ? "bg-slate-900 text-white shadow-xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {showFurigana ? "振仮名 (Furigana ON)" : "振仮名 (Furigana OFF)"}
          </button>

          <button
            onClick={() => setBookmarked(!bookmarked)}
            className={`rounded-lg px-3 py-1.5 transition cursor-pointer ${
              bookmarked ? "bg-amber-500 text-white shadow-xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {bookmarked ? "★ Bookmarked" : "☆ Bookmark"}
          </button>

          <button
            onClick={() => setMarkedRead(!markedRead)}
            className={`rounded-lg px-3 py-1.5 transition cursor-pointer ${
              markedRead ? "bg-emerald-600 text-white shadow-xs" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {markedRead ? "✓ Read" : "Mark as Read"}
          </button>
        </div>

        {/* Translation Language Toggles */}
        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
          {["en", "ta", "ml"].map((langCode) => {
            const labels: Record<string, string> = { en: "English", ta: "தமிழ்", ml: "മലയാളം" };
            const isActive = selectedLang === langCode;
            return (
              <button
                key={langCode}
                onClick={() => setSelectedLang(langCode as any)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold cursor-pointer transition ${
                  isActive ? "bg-white text-slate-950 shadow-2xs font-black" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {labels[langCode]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Embedded Audio Playback Shadowing Controller */}
      {article.audioUrl && (
        <div className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎧</span>
            <div>
              <p className="text-slate-900 font-bold">Todaii Shadowing Audio Stream</p>
              <p className="text-[10px] text-slate-400">Practise shadowing with pitch-perfect native speeds.</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Audio speed controls */}
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 border border-black/5">
              {[0.75, 1, 1.25].map((speed) => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold cursor-pointer transition ${
                    playbackSpeed === speed ? "bg-slate-900 text-white shadow-3xs" : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>

            <audio
              src={article.audioUrl}
              controls
              className="h-8 max-w-xs focus:outline-none"
              style={{ filter: "sepia(20%)" }}
            />
          </div>
        </div>
      )}

      {/* 2.5 Reading Speed and WPM Progress Tracker */}
      <div className="rounded-2xl bg-white p-4 shadow-sm border border-black/5 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
        <div className="flex items-center gap-2">
          <span className="text-xl">⏱</span>
          <div>
            <p className="text-slate-900 font-bold">WPM Speedometer Tracker</p>
            <p className="text-[10px] text-slate-400">Configure target reading words per minute.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="60"
              max="240"
              step="10"
              value={wpm}
              onChange={(e) => setWpm(Number(e.target.value))}
              className="accent-rose-600 cursor-pointer w-24 h-1.5 bg-slate-200 rounded-lg appearance-none"
            />
            <span className="font-mono text-slate-900">{wpm} WPM</span>
          </div>
          <span className="text-[11px] font-bold text-slate-400 bg-slate-50 border border-black/5 px-2.5 py-1 rounded-lg">
            Est. Read: {estimatedReadMins}m ({charCount} chars)
          </span>
        </div>
      </div>

      {/* 3. Main Japanese Article Reader Panel */}
      <article className="rounded-3xl bg-white p-8 sm:p-10 shadow-sm border border-black/5 space-y-6 relative">
        <div className="flex items-center justify-between text-xs">
          <span className="rounded-full bg-rose-100 px-3 py-1 font-bold text-rose-800 uppercase text-[10px]">
            JLPT {article.difficultyLevel} • NHK Easy
          </span>
          <span className="text-slate-500 font-bold">Todaii Daily Reading Ingestion</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-slate-950 leading-relaxed">
          {article.title}
        </h1>

        {/* Japanese Reading Body with clickable dictionary popup hook */}
        <div className="rounded-2xl bg-slate-50 p-6 text-lg sm:text-xl font-semibold leading-loose text-slate-950 border border-black/5">
          {showFurigana && article.furiganaText ? (
            <p className="whitespace-pre-line tracking-wide select-all">
              {article.furiganaText}
            </p>
          ) : (
            <p className="whitespace-pre-line tracking-wide select-all">
              {article.japaneseText}
            </p>
          )}
          <p className="text-[10px] text-slate-400 italic mt-3 text-right">
            * Drag to highlight, or check the extracted glossary below for instant dictionary lookups.
          </p>
        </div>

        {/* Translation translation overlay box */}
        <div className="rounded-2xl bg-amber-50/70 p-6 border border-amber-200/60 text-xs sm:text-sm space-y-2">
          <p className="text-[10px] font-extrabold text-amber-900 uppercase tracking-widest">
            {selectedLang === "en" ? "English Translation" : selectedLang === "ta" ? "தமிழ் மொழிபெயர்ப்பு" : "മലയാളം പരിഭാഷ"}
          </p>
          <p className="text-slate-850 leading-relaxed font-bold">
            {selectedLang === "en"
              ? article.englishTranslation
              : selectedLang === "ta"
              ? article.tamilTranslation ?? article.englishTranslation
              : article.malayalamTranslation ?? article.englishTranslation}
          </p>
        </div>
      </article>

      {/* Floating Interactive Dictionary Popup (Takoboto Inspiration) */}
      {isPopupOpen && popupWord && (
        <div className="rounded-3xl bg-slate-900 text-white p-6 shadow-xl border border-rose-500/30 animate-fade-in space-y-3 relative">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="rounded bg-rose-600 px-2 py-0.5 font-bold text-[9px] uppercase tracking-widest">Takoboto Definition</span>
            <button onClick={() => setIsPopupOpen(false)} className="text-xs text-slate-400 hover:text-white font-bold cursor-pointer">
              ✕ Close
            </button>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-black text-white">{popupWord.japanese}</p>
            <p className="text-xs text-rose-300 font-bold">Furigana: {popupWord.furigana}</p>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">English Meaning: {popupWord.meaning}</p>
          </div>
        </div>
      )}

      {/* 4. Extracted Vocabulary Glossary (TODAI-Style) */}
      {article.extractedVocabulary && article.extractedVocabulary.length > 0 && (
        <section className="rounded-3xl bg-white p-6 sm:p-8 shadow-sm border border-black/5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">Extracted Vocabulary Glossary 📚</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Click "Dictionary Lookup" to load the floating popover definition.</p>
            </div>
            <span className="text-xs text-slate-500 font-bold">{article.extractedVocabulary.length} words found</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {article.extractedVocabulary.map((vocab, i) => {
              const isSaved = savedVocab.includes(vocab.japanese);
              return (
                <div key={i} className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5 border border-black/5 text-xs">
                  <div>
                    <span className="text-base font-black text-slate-950">{vocab.japanese}</span>
                    <span className="text-rose-600 font-bold ml-2">{vocab.furigana}</span>
                    <p className="text-slate-600 mt-0.5 font-semibold">{vocab.meaning}</p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => triggerDictPopup(vocab.japanese, vocab.furigana, vocab.meaning)}
                      className="rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 px-2.5 py-1.5 font-bold cursor-pointer text-[10px]"
                    >
                      🔍 Lookup
                    </button>
                    <button
                      onClick={() => toggleSaveVocab(vocab.japanese)}
                      className={`rounded-lg px-2.5 py-1.5 font-bold transition cursor-pointer text-[10px] ${
                        isSaved ? "bg-emerald-600 text-white shadow-3xs" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {isSaved ? "Saved" : "+ Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. Extracted Kanji Breakdown */}
      {article.extractedKanji && article.extractedKanji.length > 0 && (
        <section className="rounded-3xl bg-white p-6 sm:p-8 shadow-sm border border-black/5 space-y-4">
          <h2 className="text-lg font-extrabold text-slate-950">Extracted Kanji Characters 🈸</h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
            {article.extractedKanji.map((kanji, i) => (
              <div key={i} className="rounded-xl bg-slate-50 p-4 text-center border border-black/5 hover:border-rose-300 transition">
                <p className="text-3xl font-black text-slate-950">{kanji.kanji}</p>
                <p className="text-xs font-bold text-slate-900 mt-1">{kanji.meaning}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{kanji.strokes} strokes</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. Interactive Comprehension Quiz Questions */}
      {article.comprehensionQuestions && article.comprehensionQuestions.length > 0 && (
        <section className="rounded-3xl bg-white p-6 sm:p-8 shadow-sm border border-black/5 space-y-4">
          <h2 className="text-lg font-extrabold text-slate-950">Comprehension Quiz ❓</h2>
          {article.comprehensionQuestions.map((q, qIdx) => {
            const selectedOpt = quizAnswers[qIdx];
            return (
              <div key={qIdx} className="rounded-2xl bg-slate-50 p-5 space-y-3 border border-black/5">
                <p className="font-bold text-sm text-slate-950">{q.question}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {q.options.map((opt, oIdx) => {
                    const isSelected = selectedOpt === oIdx;
                    const isCorrect = oIdx === q.correctIndex;
                    return (
                      <button
                        key={oIdx}
                        onClick={() => setQuizAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))}
                        className={`text-left rounded-xl p-3.5 text-xs font-semibold transition border cursor-pointer ${
                          selectedOpt !== undefined
                            ? isCorrect
                              ? "bg-emerald-100 border-emerald-400 text-emerald-950 font-bold"
                              : isSelected
                              ? "bg-rose-100 border-rose-400 text-rose-950"
                              : "bg-white border-slate-200 text-slate-500"
                            : "bg-white border-slate-200 text-slate-800 hover:border-rose-400"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {selectedOpt !== undefined && (
                  <p className="text-xs text-slate-500 italic pt-1 font-medium">💡 {q.explanation}</p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* 7. Discussion Forums & Notes Thread */}
      <section className="rounded-3xl bg-white p-6 sm:p-8 shadow-sm border border-black/5 space-y-4">
        <h2 className="text-lg font-extrabold text-slate-900">💬 Active Study Discussion Thread</h2>
        <p className="text-xs text-slate-500">Discuss grammar configurations or ask questions about this article.</p>

        <div className="space-y-3 pt-2">
          {comments.map((comm, idx) => (
            <div key={idx} className="rounded-2xl bg-slate-50 p-4 border border-black/5 space-y-1 text-xs">
              <div className="flex justify-between items-center font-bold text-[10px] text-slate-400">
                <span className="text-slate-800 font-bold uppercase">{comm.author}</span>
                <span>{comm.date}</span>
              </div>
              <p className="text-slate-700 leading-relaxed font-semibold">{comm.body}</p>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddComment} className="flex gap-2 pt-2 text-xs">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Type observations, share grammar notes, or ask a question..."
            className="flex-1 rounded-xl bg-white px-4 py-2.5 font-medium border border-slate-300 focus:outline-none focus:ring-1 focus:ring-rose-500"
          />
          <button
            type="submit"
            className="rounded-xl bg-slate-900 hover:bg-slate-850 px-5 py-2.5 font-bold text-white shadow-xs cursor-pointer"
          >
            Post Comment
          </button>
        </form>
      </section>
    </div>
  );
}
