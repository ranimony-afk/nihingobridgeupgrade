/**
 * RAG Pipeline — Full retrieval-augmented generation flow.
 *
 * P52: User question → Intent → Retrieve knowledge → Retrieve learning
 * context → Prompt construction → LLM → Response validation
 *
 * Each stage is a separate function — testable, debuggable, replaceable.
 */

import { KnowledgeRetrieval, type RetrievalResult } from "./knowledge-retrieval";
import { getProvider, type LLMResponse, type LLMMessage } from "./llm-provider";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type Intent =
  | "explain_word"
  | "explain_grammar"
  | "explain_kanji"
  | "translate"
  | "correct"
  | "conversation"
  | "jlpt_help"
  | "general_question"
  | "practice_suggestion";

export interface RAGInput {
  /** The user's message. */
  question: string;
  /** Learner ID for personalised context. */
  learnerId?: string;
  /** Conversation history (for multi-turn). */
  history?: { role: "user" | "assistant"; content: string }[];
  /** Force a specific intent (skip detection). */
  forceIntent?: Intent;
  /** Specific entity to explain. */
  entityRef?: { domain: string; id: string };
}

export interface RAGOutput {
  /** The AI's response text. */
  response: string;
  /** Detected intent. */
  intent: Intent;
  /** Knowledge chunks used for grounding. */
  sources: { domain: string; id: string; title: string }[];
  /** LLM metadata. */
  llm: {
    provider: string;
    model: string;
    tokensUsed: { prompt: number; completion: number; total: number };
  };
  /** Whether the response passed validation. */
  validated: boolean;
  /** Validation notes (if any issues). */
  validationNotes: string[];
  /** Pipeline stage timings in ms. */
  timings: {
    intent: number;
    retrieval: number;
    promptConstruction: number;
    llm: number;
    validation: number;
    total: number;
  };
}

// ─────────────────────────────────────────────
// System prompts
// ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Hana-sensei (花先生), a friendly and knowledgeable Japanese language tutor on the NihongoBridge learning platform.

Your role:
- Help learners understand Japanese vocabulary, grammar, kanji, and sentence structure
- Explain concepts clearly with examples
- Adapt your explanations to the learner's level (based on the LEARNER PROFILE in context)
- Use the KNOWLEDGE CONTEXT provided to give accurate, grounded answers
- Include Japanese text with readings in parentheses: 食べる（たべる）
- Be encouraging and supportive

Rules:
- ALWAYS base your answers on the KNOWLEDGE CONTEXT when relevant data is provided
- If the context doesn't contain the answer, say so honestly rather than guessing
- Use the learner's known words in your examples when possible
- Keep responses concise but thorough
- Format with markdown for readability`;

const INTENT_PROMPTS: Record<Intent, string> = {
  explain_word: "The learner is asking about a specific Japanese word or vocabulary item. Explain its meaning, readings, usage, and provide example sentences.",
  explain_grammar: "The learner is asking about a Japanese grammar pattern. Explain the structure, meaning, formation rules, and provide clear examples with translations.",
  explain_kanji: "The learner is asking about a specific kanji character. Explain its meanings, readings (on'yomi and kun'yomi), stroke count, common words that use it, and any mnemonics.",
  translate: "The learner wants to translate text between Japanese and English. Provide the translation with explanations of key grammar and vocabulary used.",
  correct: "The learner has written Japanese text and wants it corrected. Identify errors, explain why they're wrong, and provide the corrected version.",
  conversation: "The learner wants to practice Japanese conversation. Respond naturally in Japanese (with translations) and help them practice.",
  jlpt_help: "The learner has a question about JLPT preparation. Provide specific study advice, recommend focus areas, and explain test format details.",
  general_question: "The learner has a general question about Japanese language or culture. Answer helpfully using the knowledge context.",
  practice_suggestion: "Suggest what the learner should practice next based on their progress and known/unknown items.",
};

// ─────────────────────────────────────────────
// RAGPipeline
// ─────────────────────────────────────────────

export const RAGPipeline = {

  /** Run the full RAG pipeline. */
  async run(input: RAGInput): Promise<RAGOutput> {
    const totalStart = Date.now();
    const timings = { intent: 0, retrieval: 0, promptConstruction: 0, llm: 0, validation: 0, total: 0 };

    // ── Stage 1: Intent Detection ──
    let t = Date.now();
    const intent = input.forceIntent ?? this._detectIntent(input.question);
    timings.intent = Date.now() - t;

    // ── Stage 2: Retrieve Knowledge ──
    t = Date.now();
    let retrieval: RetrievalResult;

    if (input.entityRef) {
      retrieval = await KnowledgeRetrieval.retrieveForEntity(
        input.entityRef.domain, input.entityRef.id, input.learnerId,
      );
    } else {
      retrieval = await KnowledgeRetrieval.retrieve(input.question, {
        learnerId: input.learnerId,
        maxTotal: 10,
        jlptLevel: retrieval! === undefined ? undefined : undefined,
      });
    }
    timings.retrieval = Date.now() - t;

    // ── Stage 3: Prompt Construction ──
    t = Date.now();
    const messages = this._buildPrompt(input, intent, retrieval);
    timings.promptConstruction = Date.now() - t;

    // ── Stage 4: LLM Call ──
    t = Date.now();
    const provider = getProvider();
    let llmResponse: LLMResponse;
    try {
      llmResponse = await provider.call({
        messages,
        maxTokens: 1024,
        temperature: 0.7,
      });
    } catch (err) {
      llmResponse = {
        content: `I'm sorry, I'm having trouble processing your question right now. Please try again. (Error: ${err instanceof Error ? err.message : "unknown"})`,
        model: "error",
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
        provider: provider.name,
        finishReason: "error",
      };
    }
    timings.llm = Date.now() - t;

    // ── Stage 5: Response Validation ──
    t = Date.now();
    const { validated, notes } = this._validateResponse(llmResponse.content, intent, retrieval);
    timings.validation = Date.now() - t;

    timings.total = Date.now() - totalStart;

    return {
      response: llmResponse.content,
      intent,
      sources: retrieval.chunks.map((c) => ({ domain: c.domain, id: c.id, title: c.title })),
      llm: {
        provider: llmResponse.provider,
        model: llmResponse.model,
        tokensUsed: llmResponse.tokensUsed,
      },
      validated,
      validationNotes: notes,
      timings,
    };
  },

  // ═══════════════════════════════════════════
  // Stage 1: Intent Detection
  // ═══════════════════════════════════════════

  _detectIntent(question: string): Intent {
    const q = question.toLowerCase();

    // Translation request
    if (/translat|訳|やく|how do (you|i) say|how to say|what does .+ mean in (english|japanese)/i.test(q)) return "translate";

    // Correction request
    if (/correct|fix|wrong|mistake|check (my|this)|間違/i.test(q)) return "correct";

    // Kanji-specific (single kanji character in question)
    if (/kanji|漢字/.test(q) || /^[\u4E00-\u9FFF]$/.test(question.trim())) return "explain_kanji";

    // Grammar-specific
    if (/grammar|文法|particle|助詞|〜|form|conjugat|ては|ている|てから|たら|ば\s/i.test(q)) return "explain_grammar";

    // Word/vocabulary
    if (/what (does|is) .+ mean|meaning of|vocab|単語|how to use/i.test(q)) return "explain_word";

    // JLPT
    if (/jlpt|n[1-5]|test prep|試験/i.test(q)) return "jlpt_help";

    // Practice suggestion
    if (/what should i (study|practice|learn|review)|recommend|suggest/i.test(q)) return "practice_suggestion";

    // Conversation practice
    if (/let'?s (talk|chat|practice|convers)|会話|practice speaking/i.test(q)) return "conversation";

    return "general_question";
  },

  // ═══════════════════════════════════════════
  // Stage 3: Prompt Construction
  // ═══════════════════════════════════════════

  _buildPrompt(input: RAGInput, intent: Intent, retrieval: RetrievalResult): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // System prompt with intent-specific instructions
    const systemContent = [
      SYSTEM_PROMPT,
      "",
      `Current task: ${INTENT_PROMPTS[intent]}`,
      "",
      retrieval.contextText,
    ].join("\n");

    messages.push({ role: "system", content: systemContent });

    // Conversation history (if multi-turn)
    if (input.history) {
      for (const msg of input.history.slice(-6)) { // Last 6 messages for context window
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Current user message
    messages.push({ role: "user", content: input.question });

    return messages;
  },

  // ═══════════════════════════════════════════
  // Stage 5: Response Validation
  // ═══════════════════════════════════════════

  _validateResponse(
    response: string,
    intent: Intent,
    retrieval: RetrievalResult,
  ): { validated: boolean; notes: string[] } {
    const notes: string[] = [];
    let valid = true;

    // Check minimum length
    if (response.length < 20) {
      notes.push("Response too short (< 20 chars)");
      valid = false;
    }

    // Check for hallucination markers
    if (/i don't have (access|information)|as an ai/i.test(response) && retrieval.chunks.length > 0) {
      notes.push("AI claims no access but knowledge context was provided");
    }

    // Check for Japanese content when expected
    if ((intent === "explain_word" || intent === "explain_kanji" || intent === "explain_grammar") &&
        !/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(response)) {
      notes.push("Expected Japanese text in response but none found");
    }

    // Check response doesn't contain system prompt leakage
    if (/KNOWLEDGE CONTEXT|END CONTEXT|LEARNER PROFILE/.test(response)) {
      notes.push("System prompt content leaked into response");
      valid = false;
    }

    // Check response isn't just repeating the context
    if (retrieval.contextText.length > 0) {
      const contextWords = new Set(retrieval.contextText.split(/\s+/).slice(0, 50));
      const responseWords = response.split(/\s+/);
      const overlap = responseWords.filter((w) => contextWords.has(w)).length;
      if (overlap > responseWords.length * 0.8 && responseWords.length > 10) {
        notes.push("Response appears to be mostly copying context verbatim");
      }
    }

    return { validated: valid, notes };
  },
};
