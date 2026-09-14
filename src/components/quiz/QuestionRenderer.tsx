"use client";

import { useState, useEffect } from "react";
import { Question, QuestionOption, StarOrderParts } from "@/types/quiz";
import { ListeningAudioPlayer } from "./ListeningAudioPlayer";
import {
  Bookmark,
  BookmarkCheck,
  HelpCircle,
  Volume2,
  Sparkles,
  CheckCircle2,
  XCircle,
  Lightbulb,
  BookOpen,
  ArrowRight,
  RotateCcw,
  Star,
} from "lucide-react";

interface QuestionRendererProps {
  question: Question;
  questionIndex: number;
  totalQuestions: number;
  selectedAnswer?: string;
  starOrderSubmitted?: string[];
  isFlagged?: boolean;
  showInstantFeedback?: boolean;
  onAnswerChange: (selectedAnswer: string, starOrder?: string[]) => void;
  onToggleFlag?: () => void;
  onNext?: () => void;
}

export function QuestionRenderer({
  question,
  questionIndex,
  totalQuestions,
  selectedAnswer,
  starOrderSubmitted,
  isFlagged,
  showInstantFeedback = false,
  onAnswerChange,
  onToggleFlag,
  onNext,
}: QuestionRendererProps) {
  const [showTranslation, setShowTranslation] = useState(false);
  const [showExplanation, setShowExplanation] = useState(showInstantFeedback);

  // For star order question state: user placed fragments in slots [slot0, slot1, slot2, slot3]
  const [starOrderSlots, setStarOrderSlots] = useState<string[]>(
    starOrderSubmitted || []
  );

  // The parent supplies a stable key per question so local answer/reveal state
  // is initialized from the current question without synchronizing state in an effect.

  // Handle keyboard shortcuts (1, 2, 3, 4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (question.questionType === "multiple_choice" || question.questionType === "reading_passage" || question.questionType === "listening_comprehension") {
        if (["1", "2", "3", "4"].includes(e.key)) {
          const opt = question.options.find((o) => o.id === e.key);
          if (opt) {
            onAnswerChange(opt.id);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [question, onAnswerChange]);

  // Star Order interaction: click a part to place in next empty slot or toggle
  const handlePartClick = (partId: string) => {
    if (!question.starOrderParts) return;

    let newSlots = [...starOrderSlots];
    const existingIndex = newSlots.indexOf(partId);

    if (existingIndex !== -1) {
      // Remove from slot
      newSlots.splice(existingIndex, 1);
    } else {
      // Add to next available slot (up to 4 parts)
      if (newSlots.length < 4) {
        newSlots.push(partId);
      }
    }

    setStarOrderSlots(newSlots);

    // If 4 parts are placed, determine which option corresponds to the star position
    const starIndex = (question.starOrderParts.starPosition || 3) - 1;
    const starPartId = newSlots[starIndex] || "";

    onAnswerChange(starPartId, newSlots);
  };

  const handleResetStarOrder = () => {
    setStarOrderSlots([]);
    onAnswerChange("", []);
  };

  const isAnswered = Boolean(
    selectedAnswer || (question.questionType === "star_order" && starOrderSlots.length === 4)
  );

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-100 overflow-hidden">
      {/* Question Header */}
      <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-8 items-center justify-center rounded-lg bg-slate-900 px-3 text-xs font-bold text-white shadow-sm">
              Q {questionIndex + 1} / {totalQuestions}
            </span>
            <span className="rounded-md bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
              {question.jlptLevel}
            </span>
            <span className="rounded-md bg-slate-200/80 px-2.5 py-1 text-xs font-medium text-slate-700">
              {question.category.replace(/_/g, " ")}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onToggleFlag && (
              <button
                type="button"
                onClick={onToggleFlag}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  isFlagged
                    ? "border-amber-400 bg-amber-50 text-amber-700 ring-2 ring-amber-200"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                }`}
                title="Flag question for later review"
              >
                {isFlagged ? (
                  <>
                    <BookmarkCheck className="h-4 w-4 text-amber-600 fill-current" />
                    <span>Flagged</span>
                  </>
                ) : (
                  <>
                    <Bookmark className="h-4 w-4 text-slate-400" />
                    <span>Flag</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowTranslation(!showTranslation)}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              title="Show English translation"
            >
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
              <span>{showTranslation ? "Hide Translation" : "Translate"}</span>
            </button>
          </div>
        </div>

        {/* Mondai Title instruction */}
        <p className="mt-2 text-xs font-medium text-slate-700 leading-relaxed font-japanese">
          {question.mondaiTitle}
        </p>
      </div>

      {/* Main Question Body */}
      <div className="p-6 md:p-8">
        {/* Listening Audio Player (if Listening question) */}
        {question.section === "listening" && (
          <ListeningAudioPlayer
            audioScript={question.audioScript}
            audioUrl={question.audioUrl}
            prompt={question.prompt}
          />
        )}

        {/* Contextual Reading Passage (if Reading question) */}
        {question.passage && (
          <div className="mb-6 rounded-2xl border border-amber-200/80 bg-amber-50/40 p-5 text-slate-900 shadow-sm">
            <div className="mb-2 flex items-center justify-between border-b border-amber-200/70 pb-2">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900">
                <BookOpen className="h-4 w-4 text-amber-700" /> 読解本文 (Reading Passage)
              </span>
              <span className="text-[11px] font-medium text-amber-700">Read carefully</span>
            </div>
            <div className="text-base leading-loose font-japanese text-slate-900 whitespace-pre-line">
              {question.passage}
            </div>
            {showTranslation && question.passageTranslation && (
              <div className="mt-3 pt-3 border-t border-amber-200/70 text-xs text-slate-600 italic">
                {question.passageTranslation}
              </div>
            )}
          </div>
        )}

        {/* Question Prompt */}
        <div className="mb-6">
          <div className="text-xl md:text-2xl font-bold leading-relaxed font-japanese text-slate-950">
            {question.promptFurigana ? (
              <span dangerouslySetInnerHTML={{ __html: question.promptFurigana }} />
            ) : (
              <span dangerouslySetInnerHTML={{ __html: question.prompt }} />
            )}
          </div>

          {/* Translation Callout */}
          {showTranslation && (
            <p className="mt-2 text-sm text-slate-600 italic border-l-2 border-amber-400 pl-3">
              {question.promptTranslation}
            </p>
          )}
        </div>

        {/* Question Type: Star Order Arranger */}
        {question.questionType === "star_order" && question.starOrderParts && (
          <div className="mb-8 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="flex items-center gap-1 text-xs font-bold text-indigo-900 uppercase">
                <Star className="h-4 w-4 text-amber-500 fill-amber-400" />
                Arrange 4 parts into correct slots (Find part at ★)
              </span>
              {starOrderSlots.length > 0 && (
                <button
                  type="button"
                  onClick={handleResetStarOrder}
                  className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  <RotateCcw className="h-3 w-3" /> Reset Slots
                </button>
              )}
            </div>

            {/* Target Slots [1] [2] [★] [4] */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[0, 1, 2, 3].map((slotIdx) => {
                const partId = starOrderSlots[slotIdx];
                const partObj = question.starOrderParts?.parts.find((p) => p.id === partId);
                const isStarPos = slotIdx + 1 === question.starOrderParts?.starPosition;

                return (
                  <div
                    key={slotIdx}
                    className={`flex flex-col items-center justify-center min-h-[64px] rounded-xl border-2 p-2 text-center transition-all ${
                      isStarPos
                        ? "border-amber-400 bg-amber-50/70 shadow-sm ring-2 ring-amber-300"
                        : "border-dashed border-indigo-200 bg-white"
                    }`}
                  >
                    <span className="text-[10px] font-bold text-slate-400 flex items-center gap-0.5">
                      {isStarPos && <Star className="h-3 w-3 text-amber-500 fill-amber-400" />}
                      Slot {slotIdx + 1}
                    </span>
                    {partObj ? (
                      <span className="mt-1 font-bold font-japanese text-sm text-slate-900">
                        {partObj.text}
                      </span>
                    ) : (
                      <span className="mt-1 text-xs text-slate-400 italic">Empty</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Source Fragments to click/tap */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-indigo-100">
              <span className="w-full text-xs font-semibold text-slate-600 mb-1">
                Click parts below to arrange:
              </span>
              {question.starOrderParts.parts.map((part) => {
                const isPlaced = starOrderSlots.includes(part.id);
                return (
                  <button
                    key={part.id}
                    type="button"
                    onClick={() => handlePartClick(part.id)}
                    className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold font-japanese transition-all shadow-sm ${
                      isPlaced
                        ? "border-slate-300 bg-slate-100 text-slate-400 line-through opacity-70"
                        : "border-indigo-300 bg-white text-indigo-950 hover:bg-indigo-50 hover:border-indigo-500 active:scale-95"
                    }`}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
                      {part.id}
                    </span>
                    {part.text}
                  </button>
                );
              })}
            </div>

            {/* Reconstructed Sentence Preview */}
            {starOrderSlots.length === 4 && (
              <div className="mt-4 rounded-xl bg-indigo-900/5 p-3 text-sm text-indigo-950 font-japanese">
                <span className="font-bold text-indigo-800 mr-2 text-xs uppercase">Preview:</span>
                {question.prompt.split("____").map((seg, idx) => {
                  if (idx === 0) return <span key={idx}>{seg}</span>;
                  const partObj = question.starOrderParts?.parts.find(
                    (p) => p.id === starOrderSlots[idx - 1]
                  );
                  return (
                    <span key={idx}>
                      <span className="font-bold underline text-indigo-700 mx-1">
                        {partObj?.text || "___"}
                      </span>
                      {seg}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Options List (Multiple Choice or Star Answer Selection) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {question.options.map((option, idx) => {
            const isSelected = selectedAnswer === option.id;
            const isCorrectOption = question.correctAnswer === option.id;

            let optionStyle =
              "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 text-slate-800";

            if (isSelected) {
              optionStyle =
                "border-red-600 bg-red-50/60 text-red-950 ring-2 ring-red-500 shadow-sm";
            }

            if (showExplanation) {
              if (isCorrectOption) {
                optionStyle =
                  "border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-400 shadow-sm";
              } else if (isSelected && !isCorrectOption) {
                optionStyle =
                  "border-rose-400 bg-rose-50 text-rose-950 ring-1 ring-rose-300";
              }
            }

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onAnswerChange(option.id)}
                className={`group flex items-start gap-3.5 rounded-2xl border-2 p-4 text-left transition-all ${optionStyle}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-bold text-sm transition-colors ${
                    isSelected
                      ? "bg-red-600 text-white"
                      : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
                  }`}
                >
                  {option.id}
                </div>

                <div className="flex-1 pt-0.5">
                  <div className="text-base font-japanese font-medium text-slate-900 leading-snug">
                    {option.text}
                  </div>
                  {option.translation && showTranslation && (
                    <p className="mt-0.5 text-xs text-slate-500 italic">
                      {option.translation}
                    </p>
                  )}
                </div>

                {showExplanation && isCorrectOption && (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-1" />
                )}
                {showExplanation && isSelected && !isCorrectOption && (
                  <XCircle className="h-5 w-5 text-rose-600 shrink-0 mt-1" />
                )}
              </button>
            );
          })}
        </div>

        {/* Instant Feedback & Explanations Panel */}
        {showExplanation && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              <span>解説 (Detailed Solution & Grammar)</span>
            </div>

            <p className="text-sm leading-relaxed text-slate-800 font-japanese whitespace-pre-line">
              {question.explanation}
            </p>

            {/* Grammar Points Breakdown */}
            {question.explanationBreakdown?.grammarPoints &&
              question.explanationBreakdown.grammarPoints.length > 0 && (
                <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-xs">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 mb-2">
                    Key Grammar Points
                  </h4>
                  {question.explanationBreakdown.grammarPoints.map((gp, i) => (
                    <div key={i} className="mb-2 last:mb-0 text-xs">
                      <p className="font-bold text-slate-900">{gp.title}</p>
                      <p className="text-slate-600 mt-0.5">{gp.explanation}</p>
                      {gp.example && (
                        <p className="mt-1 font-japanese text-indigo-900 bg-indigo-50/50 p-1.5 rounded">
                          例: {gp.example}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

            {/* Vocabulary notes */}
            {question.explanationBreakdown?.vocabNotes &&
              question.explanationBreakdown.vocabNotes.length > 0 && (
                <div className="rounded-xl bg-white p-4 border border-slate-200/80 shadow-xs">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2">
                    Vocabulary Breakdown
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {question.explanationBreakdown.vocabNotes.map((vn, i) => (
                      <div key={i} className="p-2 rounded-lg bg-emerald-50/40 border border-emerald-100">
                        <span className="font-bold text-slate-900 font-japanese">{vn.word}</span>
                        <span className="text-slate-500 mx-1">({vn.reading})</span>
                        <span className="text-slate-700 block mt-0.5">{vn.meaning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Strategy tip */}
            {question.explanationBreakdown?.strategyTip && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                <span className="font-bold mr-1">💡 JLPT Strategy Tip:</span>
                {question.explanationBreakdown.strategyTip}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
