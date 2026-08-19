import { logger } from "@/lib/infra/logger";

export type TutorMessage = { role: "user" | "assistant"; content: string };

export function tutorProvider() {
  if (process.env.ANTHROPIC_API_KEY) return "claude" as const;
  if (process.env.OPENAI_API_KEY) return "openai" as const;
  return "local" as const;
}

export function systemPrompt(persona: string, scenario: string, level: string) {
  return [
    `You are ${persona}, a patient Japanese tutor inside NihongoBridge.`,
    `Roleplay scenario: ${scenario}. Learner level: ${level}.`,
    "Reply in short Japanese suited to the level, then one English gloss line prefixed with EN:.",
    "If the learner makes a grammar mistake, add a line prefixed with FIX: showing the corrected sentence.",
    "Keep replies under 60 Japanese characters.",
  ].join(" ");
}

function localReply(persona: string, scenario: string, level: string, history: TutorMessage[]) {
  const last = history.filter((row) => row.role === "user").at(-1)?.content ?? "";
  const openers: Record<string, string> = {
    cafe: "いらっしゃいませ。ご注文はお決まりですか。",
    station: "こんにちは。どちらまで行きますか。",
    class: "こんにちは。今日は何を勉強しましたか。",
    interview: "はじめまして。自己紹介をお願いします。",
  };
  if (!last) return `${openers[scenario] ?? "こんにちは。今日は何を話しましょうか。"}\nEN: Let's begin.`;
  if (last.includes("？") || last.includes("?")) {
    return `いい質問ですね。${level}のレベルで説明します。ゆっくり話してください。\nEN: Good question — let me answer at your level.`;
  }
  const echo = last.slice(0, 18);
  return `なるほど、「${echo}」ですね。もう少し詳しく教えてください。\nEN: I see. Tell me a little more.`;
}

async function* streamClaude(system: string, history: TutorMessage[]) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY as string,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      max_tokens: 400,
      system,
      stream: true,
      messages: history.map((row) => ({ role: row.role, content: row.content })),
    }),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Claude ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: { text?: string };
        };
        if (event.type === "content_block_delta" && event.delta?.text) {
          yield event.delta.text;
        }
      } catch {
        // ignore malformed keepalive frames
      }
    }
  }
}

async function* streamOpenAI(system: string, history: TutorMessage[]) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      stream: true,
      messages: [{ role: "system", content: system }, ...history],
    }),
  });
  if (!response.ok || !response.body) throw new Error(`OpenAI ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        const text = event.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {
        // ignore
      }
    }
  }
}

export async function* streamTutor(input: {
  persona: string;
  scenario: string;
  level: string;
  history: TutorMessage[];
}) {
  const system = systemPrompt(input.persona, input.scenario, input.level);
  const provider = tutorProvider();
  if (provider !== "local") {
    try {
      const iterator = provider === "claude" ? streamClaude(system, input.history) : streamOpenAI(system, input.history);
      for await (const chunk of iterator) {
        yield chunk;
      }
      return;
    } catch (error) {
      logger.warn("tutor.provider_failed", { message: error instanceof Error ? error.message : "unknown" });
    }
  }
  const reply = localReply(input.persona, input.scenario, input.level, input.history);
  const pieces = reply.match(/[\s\S]{1,6}/g) ?? [reply];
  for (const piece of pieces) {
    await new Promise((resolve) => setTimeout(resolve, 24));
    yield piece;
  }
}
