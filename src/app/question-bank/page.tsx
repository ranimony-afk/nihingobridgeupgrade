"use client";

import { useEffect, useState } from "react";
import { Question, JLPTLevel, QuestionCategory, QuestionSection } from "@/types/quiz";
import { QuestionRenderer } from "@/components/quiz/QuestionRenderer";
import {
  BookOpen,
  Search,
  Filter,
  Plus,
  Sparkles,
  Layers,
  ChevronRight,
  Lightbulb,
  CheckCircle2,
  X,
  Loader2,
  Tag,
} from "lucide-react";

export default function QuestionBankPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [level, setLevel] = useState<string>("N5");
  const [section, setSection] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [keyword, setKeyword] = useState<string>("");
  const [selectedTag, setSelectedTag] = useState<string>("");

  // Question Try Mode
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});

  // Add Question Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newQuestion, setNewQuestion] = useState({
    jlptLevel: "N5",
    section: "vocab",
    category: "kanji_reading",
    mondaiNumber: 1,
    mondaiTitle: "問題１ つぎの ぶんの の ことばは どう よみますか。",
    questionType: "multiple_choice",
    prompt: "",
    promptTranslation: "",
    options: [
      { id: "1", text: "" },
      { id: "2", text: "" },
      { id: "3", text: "" },
      { id: "4", text: "" },
    ],
    correctAnswer: "1",
    explanation: "",
    tags: "daily-life, kanji",
  });
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  useEffect(() => {
    fetchQuestions();
  }, [level, section, category, selectedTag]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (level && level !== "all") params.set("level", level);
      if (section && section !== "all") params.set("section", section);
      if (category && category !== "all") params.set("category", category);
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (selectedTag) params.set("tag", selectedTag);

      const res = await fetch(`/api/questions?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setQuestions(json.questions || []);
        setTotal(json.total || 0);
      }
    } catch (e) {
      console.error("Failed to load questions:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchQuestions();
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingNew(true);
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newQuestion,
          tags: newQuestion.tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });

      const json = await res.json();
      if (json.success) {
        setShowAddModal(false);
        fetchQuestions();
        alert("Question added to Question Bank successfully!");
      } else {
        alert("Error: " + json.error);
      }
    } catch (e: any) {
      alert("Failed to create question: " + e.message);
    } finally {
      setIsSubmittingNew(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100/60 pb-20 pt-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                Question Bank
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {total} Total Questions Available
              </span>
            </div>
            <h1 className="mt-1 text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              JLPT Question Repository & Explorer
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800 shadow-md transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Custom Question
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          {/* Level Badges */}
          <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-100">
            <span className="text-xs font-bold text-slate-700 mr-2 flex items-center gap-1">
              <Layers className="h-3.5 w-3.5 text-slate-400" /> JLPT Level:
            </span>
            {["all", "N5", "N4", "N3", "N2", "N1"].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevel(lvl)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                  level === lvl
                    ? "bg-red-600 text-white shadow-xs"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {lvl === "all" ? "All Levels" : lvl}
              </button>
            ))}
          </div>

          {/* Section & Search Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="sm:col-span-5 relative">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search Japanese text, prompt, or explanation..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:bg-white focus:outline-none"
              />
            </form>

            {/* Section dropdown */}
            <div className="sm:col-span-3">
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-red-500 focus:outline-none"
              >
                <option value="all">All Sections (全セクション)</option>
                <option value="vocab">文字・語彙 (Vocab & Kanji)</option>
                <option value="grammar">文法 (Grammar & Star ★)</option>
                <option value="reading">読解 (Reading Passages)</option>
                <option value="listening">聴解 (Listening Comprehension)</option>
              </select>
            </div>

            {/* Category dropdown */}
            <div className="sm:col-span-4">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-red-500 focus:outline-none"
              >
                <option value="all">All Categories (全問題形式)</option>
                <option value="kanji_reading">漢字読み (Kanji Reading)</option>
                <option value="orthography">表記 (Orthography)</option>
                <option value="contextual_use">文脈規定 (Contextual Use)</option>
                <option value="paraphrase">言い換え類義 (Paraphrasing)</option>
                <option value="grammar_form">文法形式判断 (Grammar Form)</option>
                <option value="sentence_order">文の組み立て ★ (Star Order)</option>
                <option value="text_grammar">文章の文法 (Text Grammar)</option>
                <option value="reading_short">短文読解 (Short Reading)</option>
                <option value="reading_mid">中文読解 (Medium Reading)</option>
                <option value="reading_info">情報検索 (Information Retrieval)</option>
                <option value="listening_task">課題理解 (Listening Task)</option>
                <option value="listening_point">ポイント理解 (Listening Point)</option>
                <option value="listening_utterance">発話表現 (Utterance)</option>
                <option value="listening_quick">即時応答 (Quick Response)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Questions Stream */}
        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-red-600" />
          </div>
        ) : questions.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-500">
            <BookOpen className="mx-auto h-12 w-12 text-slate-300 mb-2" />
            <h3 className="text-base font-bold text-slate-800">No matching questions</h3>
            <p className="text-xs text-slate-400 mt-1">
              Try adjusting your level, section or keyword filters.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {questions.map((q, idx) => (
              <div key={q.id} className="relative">
                <QuestionRenderer
                  question={q}
                  questionIndex={idx}
                  totalQuestions={questions.length}
                  selectedAnswer={userAnswers[q.id]}
                  showInstantFeedback={true}
                  onAnswerChange={(ans) =>
                    setUserAnswers((prev) => ({ ...prev, [q.id]: ans }))
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Custom Question Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 md:p-8 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Add Question to Question Bank</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuestion} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">JLPT Level</label>
                  <select
                    value={newQuestion.jlptLevel}
                    onChange={(e) =>
                      setNewQuestion({ ...newQuestion, jlptLevel: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 p-2.5 font-semibold"
                  >
                    <option value="N5">N5</option>
                    <option value="N4">N4</option>
                    <option value="N3">N3</option>
                    <option value="N2">N2</option>
                    <option value="N1">N1</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Section</label>
                  <select
                    value={newQuestion.section}
                    onChange={(e) =>
                      setNewQuestion({ ...newQuestion, section: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 p-2.5 font-semibold"
                  >
                    <option value="vocab">Vocabulary</option>
                    <option value="grammar">Grammar</option>
                    <option value="reading">Reading</option>
                    <option value="listening">Listening</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={newQuestion.category}
                    onChange={(e) =>
                      setNewQuestion({ ...newQuestion, category: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 p-2.5 font-semibold"
                  >
                    <option value="kanji_reading">Kanji Reading</option>
                    <option value="orthography">Orthography</option>
                    <option value="contextual_use">Contextual Use</option>
                    <option value="grammar_form">Grammar Form</option>
                    <option value="sentence_order">Sentence Order ★</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Japanese Prompt (with ruby tags or raw text)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. わたしは <ruby>朝<rt>あさ</rt></ruby> ごはんを 食べます。"
                  value={newQuestion.prompt}
                  onChange={(e) =>
                    setNewQuestion({ ...newQuestion, prompt: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-japanese text-sm"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  English Translation
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. I eat breakfast in the morning."
                  value={newQuestion.promptTranslation}
                  onChange={(e) =>
                    setNewQuestion({ ...newQuestion, promptTranslation: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 p-2.5"
                />
              </div>

              {/* 4 Options */}
              <div className="grid grid-cols-2 gap-3">
                {[0, 1, 2, 3].map((optIdx) => (
                  <div key={optIdx}>
                    <label className="block font-bold text-slate-700 mb-1">
                      Option {optIdx + 1}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={`Option ${optIdx + 1}`}
                      value={newQuestion.options[optIdx]?.text || ""}
                      onChange={(e) => {
                        const nextOpts = [...newQuestion.options];
                        nextOpts[optIdx] = {
                          id: String(optIdx + 1),
                          text: e.target.value,
                        };
                        setNewQuestion({ ...newQuestion, options: nextOpts });
                      }}
                      className="w-full rounded-xl border border-slate-200 p-2.5 font-japanese"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Correct Option
                  </label>
                  <select
                    value={newQuestion.correctAnswer}
                    onChange={(e) =>
                      setNewQuestion({ ...newQuestion, correctAnswer: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 p-2.5 font-semibold"
                  >
                    <option value="1">Option 1</option>
                    <option value="2">Option 2</option>
                    <option value="3">Option 3</option>
                    <option value="4">Option 4</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={newQuestion.tags}
                    onChange={(e) =>
                      setNewQuestion({ ...newQuestion, tags: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 p-2.5"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Explanation & Breakdown
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Detailed grammatical or lexical explanation..."
                  value={newQuestion.explanation}
                  onChange={(e) =>
                    setNewQuestion({ ...newQuestion, explanation: e.target.value })
                  }
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-japanese"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew}
                  className="rounded-xl bg-red-600 px-5 py-2 font-bold text-white shadow-md shadow-red-500/20 disabled:opacity-50"
                >
                  {isSubmittingNew ? "Saving..." : "Save Question"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
