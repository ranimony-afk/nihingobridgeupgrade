/**
 * TutorChat — Conversation management for the AI tutor.
 *
 * P53: Integrates Repo B's rich chat interface patterns with Repo A's
 * RAG pipeline backend. Manages conversation sessions, message history,
 * context injection, and quick actions.
 *
 * Repo B features adopted:
 *   - TutorContext (level, mistakes, topic, language preference)
 *   - Quick actions (explain, example, quiz)
 *   - Conversation persistence
 *   - Markdown with furigana support
 *
 * Repo A backend:
 *   - RAGPipeline for knowledge-grounded responses
 *   - KnowledgeRetrieval for context
 *   - LLM provider abstraction
 */

import { eq, and, desc, asc, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  // We'll use the schema tables if they exist, otherwise in-memory
  // The P11 schema has ai_conversations and ai_messages — but those
  // weren't created in this sandbox. We'll use lightweight storage.
} from "@/db/schema";
import { RAGPipeline, type RAGOutput, type Intent } from "./rag-pipeline";
import { KnowledgeRetrieval } from "./knowledge-retrieval";

// ─────────────────────────────────────────────
// Types (adapted from Repo B's tutor.ts)
// ─────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type TutorLanguage = "en" | "ta" | "ml" | "hi";

export interface TutorContext {
  currentLevel: "N5" | "N4" | "N3" | "N2" | "N1";
  recentMistakes: string[];
  currentTopic?: string;
  languagePreference: TutorLanguage;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Which intent was detected for this message (assistant messages only). */
  intent?: Intent;
  /** Knowledge sources used (assistant messages only). */
  sources?: { domain: string; id: string; title: string }[];
  /** Token usage (assistant messages only). */
  tokensUsed?: number;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  learnerId: string;
  title: string;
  context: TutorContext;
  messages: ChatMessage[];
  /** What entity/topic this conversation is about (for context retrieval). */
  topicRef?: { domain: string; id: string };
  createdAt: Date;
  updatedAt: Date;
}

export interface SendMessageInput {
  conversationId: string;
  message: string;
  learnerId: string;
}

export interface SendMessageResult {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  rag: {
    intent: Intent;
    sources: { domain: string; id: string; title: string }[];
    tokensUsed: number;
    provider: string;
    timings: Record<string, number>;
    validated: boolean;
  };
}

export interface QuickAction {
  label: string;
  text: string;
  icon: string;
}

// ─────────────────────────────────────────────
// Quick actions (adapted from Repo B)
// ─────────────────────────────────────────────

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Explain this", text: "Please explain this simply with examples.", icon: "💡" },
  { label: "Give an example", text: "Give me another example sentence and explain it.", icon: "📝" },
  { label: "Quiz me", text: "Quiz me on this topic with one short question. Don't reveal the answer yet.", icon: "❓" },
  { label: "Common mistakes", text: "What are common mistakes learners make with this?", icon: "⚠️" },
  { label: "Similar patterns", text: "What similar patterns or words should I know?", icon: "🔗" },
  { label: "How to remember", text: "Give me a memory trick or mnemonic for this.", icon: "🧠" },
];

// ─────────────────────────────────────────────
// In-memory conversation store
// In production: database-backed via ai_conversations + ai_messages tables
// ─────────────────────────────────────────────

const conversations = new Map<string, Conversation>();

// ─────────────────────────────────────────────
// TutorChat
// ─────────────────────────────────────────────

export const TutorChat = {

  /** Get available quick actions. */
  getQuickActions(): QuickAction[] {
    return QUICK_ACTIONS;
  },

  /** Start a new conversation. */
  async startConversation(
    learnerId: string,
    context: TutorContext,
    topicRef?: { domain: string; id: string },
    initialMessage?: string,
  ): Promise<{ conversation: Conversation; assistantMessage?: SendMessageResult }> {
    const id = genId("conv");

    // Generate title from topic or first message
    let title = "New Conversation";
    if (topicRef) {
      const chunk = await KnowledgeRetrieval.retrieveForEntity(topicRef.domain, topicRef.id);
      if (chunk.chunks.length > 0) title = `About: ${chunk.chunks[0]!.title}`;
    } else if (initialMessage) {
      title = initialMessage.slice(0, 50) + (initialMessage.length > 50 ? "…" : "");
    }

    const conversation: Conversation = {
      id, learnerId, title, context,
      messages: [],
      topicRef,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add system context message
    const systemMsg: ChatMessage = {
      id: genId("msg"),
      role: "system",
      content: `Conversation started. Learner level: ${context.currentLevel}. Topic: ${title}. Language: ${context.languagePreference}.`,
      timestamp: new Date(),
    };
    conversation.messages.push(systemMsg);

    conversations.set(id, conversation);

    // If initial message provided, send it
    let assistantMessage: SendMessageResult | undefined;
    if (initialMessage) {
      assistantMessage = await this.sendMessage({ conversationId: id, message: initialMessage, learnerId });
    }

    return { conversation: this._sanitize(conversation), assistantMessage };
  },

  /** Send a message in a conversation. */
  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const conv = conversations.get(input.conversationId);
    if (!conv) throw new Error("Conversation not found");

    // Add user message
    const userMsg: ChatMessage = {
      id: genId("msg"),
      role: "user",
      content: input.message,
      timestamp: new Date(),
    };
    conv.messages.push(userMsg);

    // Build conversation history for RAG
    const history = conv.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    // Run RAG pipeline
    const ragResult = await RAGPipeline.run({
      question: input.message,
      learnerId: input.learnerId,
      history: history.slice(-8),
      entityRef: conv.topicRef,
    });

    // Add assistant message
    const assistantMsg: ChatMessage = {
      id: genId("msg"),
      role: "assistant",
      content: ragResult.response,
      intent: ragResult.intent,
      sources: ragResult.sources,
      tokensUsed: ragResult.llm.tokensUsed.total,
      timestamp: new Date(),
    };
    conv.messages.push(assistantMsg);
    conv.updatedAt = new Date();

    return {
      userMessage: userMsg,
      assistantMessage: assistantMsg,
      rag: {
        intent: ragResult.intent,
        sources: ragResult.sources,
        tokensUsed: ragResult.llm.tokensUsed.total,
        provider: ragResult.llm.provider,
        timings: ragResult.timings,
        validated: ragResult.validated,
      },
    };
  },

  /** Get a conversation by ID. */
  getConversation(conversationId: string): Conversation | null {
    const conv = conversations.get(conversationId);
    return conv ? this._sanitize(conv) : null;
  },

  /** List conversations for a learner. */
  listConversations(learnerId: string): Conversation[] {
    const result: Conversation[] = [];
    for (const conv of conversations.values()) {
      if (conv.learnerId === learnerId) result.push(this._sanitize(conv));
    }
    return result.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  },

  /** Delete a conversation. */
  deleteConversation(conversationId: string): boolean {
    return conversations.delete(conversationId);
  },

  /** Get conversation stats for a learner. */
  getStats(learnerId: string): {
    totalConversations: number;
    totalMessages: number;
    totalTokensUsed: number;
    topIntents: { intent: string; count: number }[];
  } {
    let totalMessages = 0;
    let totalTokens = 0;
    const intentCounts: Record<string, number> = {};

    for (const conv of conversations.values()) {
      if (conv.learnerId !== learnerId) continue;
      for (const msg of conv.messages) {
        if (msg.role !== "system") totalMessages++;
        if (msg.tokensUsed) totalTokens += msg.tokensUsed;
        if (msg.intent) {
          intentCounts[msg.intent] = (intentCounts[msg.intent] ?? 0) + 1;
        }
      }
    }

    const topIntents = Object.entries(intentCounts)
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalConversations: this.listConversations(learnerId).length,
      totalMessages,
      totalTokensUsed: totalTokens,
      topIntents,
    };
  },

  _sanitize(conv: Conversation): Conversation {
    return {
      ...conv,
      messages: conv.messages.filter((m) => m.role !== "system"),
    };
  },
};
