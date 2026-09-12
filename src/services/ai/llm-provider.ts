/**
 * LLM Provider — Pluggable interface for AI model calls.
 *
 * Supports OpenAI, Anthropic, or a mock provider for testing.
 * The RAG pipeline calls this — never the model directly.
 */

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: { prompt: number; completion: number; total: number };
  provider: string;
  finishReason: string;
}

export interface LLMProvider {
  name: string;
  call(request: LLMRequest): Promise<LLMResponse>;
}

// ─────────────────────────────────────────────
// Mock Provider (no API key needed)
// ─────────────────────────────────────────────

const mockProvider: LLMProvider = {
  name: "mock",
  async call(request: LLMRequest): Promise<LLMResponse> {
    const userMsg = request.messages.filter((m) => m.role === "user").pop();
    const query = userMsg?.content ?? "";

    // Generate a contextual mock response based on query keywords
    let response: string;
    if (/食べる|taberu|eat/i.test(query)) {
      response = "食べる (たべる) is an ichidan verb meaning \"to eat\". It's one of the first verbs you'll learn in Japanese!\n\n**Conjugations:**\n- ます form: 食べます\n- て form: 食べて\n- ない form: 食べない\n\n**Example:** 毎日ご飯を食べます。(I eat rice every day.)";
    } else if (/grammar|particle|は|が/i.test(query)) {
      response = "Great question about Japanese grammar! In Japanese, particles are small words that indicate the grammatical function of the word before them.\n\n**は (wa)** marks the topic of the sentence.\n**が (ga)** marks the subject.\n\nExample: 私**は**学生です。(As for me, I am a student.)";
    } else if (/kanji|漢字/i.test(query)) {
      response = "Kanji are Chinese characters used in Japanese writing. For JLPT N5, you need to know about 80 kanji.\n\nTip: Learn kanji through words, not in isolation. For example, learn 食 through 食べる (to eat) and 食事 (meal).";
    } else if (/jlpt|test/i.test(query)) {
      response = "The JLPT (Japanese Language Proficiency Test) has 5 levels:\n- **N5**: Beginner (~800 vocab, ~80 kanji)\n- **N4**: Elementary (~1,500 vocab, ~200 kanji)\n- **N3**: Intermediate (~3,750 vocab, ~650 kanji)\n- **N2**: Upper intermediate (~6,000 vocab, ~1,000 kanji)\n- **N1**: Advanced (~10,000 vocab, ~2,000 kanji)";
    } else {
      response = `That's a great question about Japanese! Based on your current level, I'd recommend focusing on building your vocabulary through daily practice.\n\nKeep studying! 頑張って！(がんばって！ — Do your best!)`;
    }

    // Simulate token counting
    const promptTokens = request.messages.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0);
    const completionTokens = Math.ceil(response.length / 4);

    return {
      content: response,
      model: "mock-tutor-v1",
      tokensUsed: { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
      provider: "mock",
      finishReason: "stop",
    };
  },
};

// ─────────────────────────────────────────────
// Provider selection
// ─────────────────────────────────────────────

export function getProvider(): LLMProvider {
  const openaiKey = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (openaiKey) {
    return createOpenAIProvider(openaiKey);
  }
  if (anthropicKey) {
    return createAnthropicProvider(anthropicKey);
  }

  console.log("[llm] No API key configured — using mock provider");
  return mockProvider;
}

function createOpenAIProvider(apiKey: string): LLMProvider {
  return {
    name: "openai",
    async call(request: LLMRequest): Promise<LLMResponse> {
      const model = request.model ?? "gpt-4o-mini";
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: request.messages,
          max_tokens: request.maxTokens ?? 1024,
          temperature: request.temperature ?? 0.7,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        choices: { message: { content: string }; finish_reason: string }[];
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        model: string;
      };

      return {
        content: data.choices[0]?.message.content ?? "",
        model: data.model,
        tokensUsed: { prompt: data.usage.prompt_tokens, completion: data.usage.completion_tokens, total: data.usage.total_tokens },
        provider: "openai",
        finishReason: data.choices[0]?.finish_reason ?? "stop",
      };
    },
  };
}

function createAnthropicProvider(apiKey: string): LLMProvider {
  return {
    name: "anthropic",
    async call(request: LLMRequest): Promise<LLMResponse> {
      const model = request.model ?? "claude-sonnet-4-20250514";
      const system = request.messages.find((m) => m.role === "system")?.content ?? "";
      const messages = request.messages.filter((m) => m.role !== "system");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          system,
          messages,
          max_tokens: request.maxTokens ?? 1024,
          temperature: request.temperature ?? 0.7,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        content: { text: string }[];
        model: string;
        usage: { input_tokens: number; output_tokens: number };
        stop_reason: string;
      };

      return {
        content: data.content[0]?.text ?? "",
        model: data.model,
        tokensUsed: { prompt: data.usage.input_tokens, completion: data.usage.output_tokens, total: data.usage.input_tokens + data.usage.output_tokens },
        provider: "anthropic",
        finishReason: data.stop_reason,
      };
    },
  };
}
