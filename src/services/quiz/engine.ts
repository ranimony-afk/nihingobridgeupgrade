import {
  Question,
  TestAnswerSubmission,
  QuestionEvaluationResult,
  DetailedTestResult,
  SectionScoreSummary,
  CategoryPerformance,
  DiagnosticRecommendation,
  JLPTLevel,
  QuestionCategory,
} from "@/types/quiz";
import { OFFICIAL_JLPT_SPECS } from "@/types/jlpt";

export class QuizEngine {
  /**
   * Evaluate a single question answer submission
   */
  static evaluateAnswer(
    question: Question,
    submission: {
      selectedAnswer?: string;
      starOrderSubmitted?: string[];
      timeSpentSeconds?: number;
      isFlagged?: boolean;
    }
  ): QuestionEvaluationResult {
    let isCorrect = false;

    if (question.questionType === "star_order") {
      if (question.starOrderParts) {
        const expectedOrder = question.starOrderParts.correctOrder;
        const starPos = question.starOrderParts.starPosition - 1; // 0-indexed
        const expectedStarId = expectedOrder[starPos];

        if (submission.starOrderSubmitted && submission.starOrderSubmitted.length > 0) {
          // Check if full order is correct or star position is correct
          const userStarPart = submission.starOrderSubmitted[starPos];
          const isFullOrderMatch =
            submission.starOrderSubmitted.join(",") === expectedOrder.join(",");
          const isStarMatch = userStarPart === expectedStarId;

          // In official JLPT, points are given if the option chosen at ★ matches the expected part
          isCorrect = isStarMatch || isFullOrderMatch;
        } else if (submission.selectedAnswer) {
          // If user selected option ID representing the star part
          isCorrect = submission.selectedAnswer.trim() === question.correctAnswer.trim();
        }
      } else {
        isCorrect = submission.selectedAnswer?.trim() === question.correctAnswer.trim();
      }
    } else {
      // Standard Multiple choice, reading passage, listening comprehension, fill in blank
      isCorrect =
        Boolean(submission.selectedAnswer) &&
        submission.selectedAnswer?.trim() === question.correctAnswer.trim();
    }

    return {
      questionId: question.id,
      isCorrect,
      selectedAnswer: submission.selectedAnswer,
      correctAnswer: question.correctAnswer,
      starOrderSubmitted: submission.starOrderSubmitted,
      expectedStarOrder: question.starOrderParts?.correctOrder,
      timeSpentSeconds: submission.timeSpentSeconds ?? 0,
      isFlagged: Boolean(submission.isFlagged),
      question,
    };
  }

  /**
   * Calculate complete JLPT exam results, scaled scores, category mastery, and recommendations
   */
  static calculateFullExamResult(params: {
    sessionId: string;
    testId?: string | null;
    title: string;
    jlptLevel: JLPTLevel;
    quizType: string;
    isTimed: boolean;
    timeLimitSeconds: number;
    startedAt: string | Date;
    completedAt?: string | Date;
    questions: Question[];
    answers: Array<{
      questionId: string;
      selectedAnswer?: string;
      starOrderSubmitted?: string[];
      timeSpentSeconds: number;
      isFlagged?: boolean;
    }>;
  }): DetailedTestResult {
    const {
      sessionId,
      testId,
      title,
      jlptLevel,
      quizType,
      isTimed,
      timeLimitSeconds,
      startedAt,
      completedAt,
      questions,
      answers,
    } = params;

    const answerMap = new Map(answers.map((a) => [a.questionId, a]));
    const evaluations: QuestionEvaluationResult[] = [];
    let totalTimeSpent = 0;

    for (const q of questions) {
      const userAns = answerMap.get(q.id) || {
        selectedAnswer: undefined,
        starOrderSubmitted: undefined,
        timeSpentSeconds: 0,
        isFlagged: false,
      };
      totalTimeSpent += userAns.timeSpentSeconds || 0;
      evaluations.push(this.evaluateAnswer(q, userAns));
    }

    const totalQuestions = questions.length;
    const correctCount = evaluations.filter((e) => e.isCorrect).length;
    const rawPercentage = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

    // JLPT Official Specs
    const spec = OFFICIAL_JLPT_SPECS[jlptLevel] || OFFICIAL_JLPT_SPECS["N5"];

    // Group evaluations by section
    const sectionGroups: Record<string, { total: number; correct: number; title: string }> = {
      language_knowledge_reading: {
        total: 0,
        correct: 0,
        title: "Language Knowledge (Vocab/Grammar) & Reading",
      },
      listening: {
        total: 0,
        correct: 0,
        title: "Listening Comprehension",
      },
    };

    // Category Map for A/B/C ratings
    const categoryMap: Record<
      string,
      { total: number; correct: number; categoryName: string; key: QuestionCategory }
    > = {};

    for (const ev of evaluations) {
      const q = ev.question;

      // Section mapping
      let sectionKey = "language_knowledge_reading";
      if (q.section === "listening") {
        sectionKey = "listening";
      }

      if (!sectionGroups[sectionKey]) {
        sectionGroups[sectionKey] = {
          total: 0,
          correct: 0,
          title: q.section === "listening" ? "Listening Comprehension" : "Language Knowledge & Reading",
        };
      }

      sectionGroups[sectionKey].total += 1;
      if (ev.isCorrect) {
        sectionGroups[sectionKey].correct += 1;
      }

      // Category mapping
      const catKey = q.category;
      if (!categoryMap[catKey]) {
        categoryMap[catKey] = {
          total: 0,
          correct: 0,
          categoryName: this.getCategoryDisplayName(catKey),
          key: catKey,
        };
      }
      categoryMap[catKey].total += 1;
      if (ev.isCorrect) {
        categoryMap[catKey].correct += 1;
      }
    }

    // Compute Section Scores & Pass/Fail status
    const sectionScores: Record<string, SectionScoreSummary> = {};
    let totalScaledScore = 0;
    let allSectionsPassed = true;

    // Default JLPT N5 weights: Lang+Reading = 120 max (pass 38), Listening = 60 max (pass 19)
    const langReadingGroup = sectionGroups["language_knowledge_reading"];
    const listeningGroup = sectionGroups["listening"];

    const langReadingMax = 120;
    const langReadingPass = 38;
    const listeningMax = 60;
    const listeningPass = 19;

    if (langReadingGroup && langReadingGroup.total > 0) {
      const pct = (langReadingGroup.correct / langReadingGroup.total);
      const earned = Math.round(pct * langReadingMax);
      const passed = earned >= langReadingPass;
      if (!passed) allSectionsPassed = false;
      totalScaledScore += earned;

      sectionScores["language_knowledge_reading"] = {
        title: langReadingGroup.title,
        sectionKey: "language_knowledge_reading",
        earned,
        max: langReadingMax,
        percentage: Math.round(pct * 100),
        passed,
        requiredScore: langReadingPass,
      };
    } else {
      // If quiz didn't include lang reading, handle gracefully
      sectionScores["language_knowledge_reading"] = {
        title: "Language Knowledge & Reading",
        sectionKey: "language_knowledge_reading",
        earned: 0,
        max: langReadingMax,
        percentage: 0,
        passed: true,
        requiredScore: langReadingPass,
      };
    }

    if (listeningGroup && listeningGroup.total > 0) {
      const pct = (listeningGroup.correct / listeningGroup.total);
      const earned = Math.round(pct * listeningMax);
      const passed = earned >= listeningPass;
      if (!passed) allSectionsPassed = false;
      totalScaledScore += earned;

      sectionScores["listening"] = {
        title: listeningGroup.title,
        sectionKey: "listening",
        earned,
        max: listeningMax,
        percentage: Math.round(pct * 100),
        passed,
        requiredScore: listeningPass,
      };
    } else {
      sectionScores["listening"] = {
        title: "Listening Comprehension",
        sectionKey: "listening",
        earned: 0,
        max: listeningMax,
        percentage: 0,
        passed: true,
        requiredScore: listeningPass,
      };
    }

    // For short drill quizzes with custom total points
    if (quizType !== "jlpt_mock") {
      totalScaledScore = Math.round(rawPercentage);
    }

    const overallPassThreshold = quizType === "jlpt_mock" ? spec.passingScore : 70;
    const passed =
      quizType === "jlpt_mock"
        ? totalScaledScore >= overallPassThreshold && allSectionsPassed
        : rawPercentage >= overallPassThreshold;

    // Calculate Category Performance (A/B/C)
    const categoryBreakdown: Record<string, CategoryPerformance> = {};
    for (const [key, data] of Object.entries(categoryMap)) {
      const pct = data.total > 0 ? (data.correct / data.total) * 100 : 0;
      let grade: "A" | "B" | "C" = "C";
      if (pct >= 67) grade = "A";
      else if (pct >= 34) grade = "B";

      categoryBreakdown[key] = {
        categoryName: data.categoryName,
        categoryKey: data.key,
        correct: data.correct,
        total: data.total,
        percentage: Math.round(pct * 10) / 10,
        grade,
      };
    }

    // Generate Personalized Weakness Recommendations
    const recommendations = this.generateRecommendations(evaluations, jlptLevel);

    return {
      sessionId,
      testId,
      title,
      jlptLevel,
      quizType,
      isTimed,
      totalTimeSpentSeconds: totalTimeSpent,
      timeLimitSeconds,
      score: totalScaledScore,
      maxScore: quizType === "jlpt_mock" ? spec.totalScore : 100,
      percentage: Math.round(rawPercentage * 10) / 10,
      passed,
      passingScore: overallPassThreshold,
      sectionScores,
      categoryBreakdown,
      recommendations,
      evaluations,
      startedAt,
      completedAt: completedAt || new Date().toISOString(),
    };
  }

  /**
   * Generate actionable study recommendations based on failed questions and tags
   */
  private static generateRecommendations(
    evaluations: QuestionEvaluationResult[],
    jlptLevel: JLPTLevel
  ): DiagnosticRecommendation[] {
    const wrongEvals = evaluations.filter((e) => !e.isCorrect);
    const tagCount: Record<string, number> = {};
    const catCount: Record<string, number> = {};

    for (const w of wrongEvals) {
      const cat = w.question.category;
      catCount[cat] = (catCount[cat] || 0) + 1;

      for (const tag of w.question.tags || []) {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      }
    }

    const recs: DiagnosticRecommendation[] = [];

    if (catCount["sentence_order"] && catCount["sentence_order"] > 0) {
      recs.push({
        title: "Master Sentence Star Composition (文の組み立て ★)",
        description:
          "Work on identifying noun-modifying clauses and paired particles (〜と いっしょに, 〜から 〜まで) before filling in position ★.",
        level: jlptLevel,
        domain: "Grammar Structure",
        severity: "high",
      });
    }

    if (tagCount["particles"] && tagCount["particles"] >= 1) {
      recs.push({
        title: "Reinforce Essential Particle Distinctions (で vs に vs を)",
        description:
          "Review location of action (で) vs location of existence/direction (に/へ), and target marking with を.",
        level: jlptLevel,
        domain: "Grammar Particles",
        severity: "high",
      });
    }

    if (tagCount["te-form"] && tagCount["te-form"] >= 1) {
      recs.push({
        title: "Practice Verb て-form Conjugation Rules",
        description:
          "Solidify Group 1 verb changes (う/つ/る → って, む/ぶ/ぬ → んで, く → いて, す → して) for 〜てください and 〜てはいけません requests.",
        level: jlptLevel,
        domain: "Verb Conjugation",
        severity: "medium",
      });
    }

    if (catCount["kanji_reading"] && catCount["kanji_reading"] >= 1) {
      recs.push({
        title: "Drill Daily N5 Kanji Kun-yomi & On-yomi Readings",
        description:
          "Pay close attention to long vowel marks (おお vs おう) and voiced consonant shifts (でんしゃ vs てんしゃ).",
        level: jlptLevel,
        domain: "Kanji & Vocabulary",
        severity: "medium",
      });
    }

    if (catCount["listening_task"] || catCount["listening_point"]) {
      recs.push({
        title: "Strengthen Listening Chronology & Distractor Filtering",
        description:
          "Listen for sequence indicators (まず, そのあと, 〜てから) and notice when speakers correct their first impulse.",
        level: jlptLevel,
        domain: "Listening Comprehension",
        severity: "medium",
      });
    }

    if (recs.length === 0) {
      recs.push({
        title: "Outstanding Performance! Ready for Next Milestones",
        description:
          "You demonstrated high accuracy across vocabulary, grammar, and listening. Maintain your daily streak and progress to N4 material!",
        level: jlptLevel,
        domain: "Overall Mastery",
        severity: "low",
      });
    }

    return recs;
  }

  public static getCategoryDisplayName(category: QuestionCategory | string): string {
    const names: Record<string, string> = {
      kanji_reading: "Kanji Reading (漢字読み)",
      orthography: "Orthography (表記)",
      contextual_use: "Contextual Use (文脈規定)",
      paraphrase: "Paraphrases (言い換え類義)",
      usage: "Usage (用法)",
      grammar_form: "Grammar Forms (文法形式)",
      sentence_order: "Sentence Composition (文の組み立て ★)",
      text_grammar: "Text Grammar (文章の文法)",
      reading_short: "Short Reading (短文読解)",
      reading_mid: "Medium Reading (中文読解)",
      reading_info: "Information Retrieval (情報検索)",
      listening_task: "Task Comprehension (課題理解)",
      listening_point: "Point Comprehension (ポイント理解)",
      listening_utterance: "Utterance Expressions (発話表現)",
      listening_quick: "Quick Response (即時応答)",
    };
    return names[category] || category;
  }
}
