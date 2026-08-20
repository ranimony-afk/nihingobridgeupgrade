import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { kgGrammar, kgLexemes, tutorMessages, tutorSessions } from "@/db/schema";
import { uid } from "@/lib/utils";
import { detectCorrections, detectGrammar, detectVocabulary, nextDifficulty, scoreTurn } from "./analyze";
import { tutorProvider } from "./provider";

export const SCENARIOS = [
  { id: "cafe", label: "Cafe order", persona: "Mochi Sensei" },
  { id: "station", label: "Station directions", persona: "Yamada-san" },
  { id: "class", label: "Classroom check-in", persona: "Aiko Sensei" },
  { id: "interview", label: "Job interview", persona: "Sato Buchou" },
];

export async function startSession(input: { learnerId?: string | null; scenario: string; level: string }) {
  const scenario = SCENARIOS.find((row) => row.id === input.scenario) ?? SCENARIOS[0]!;
  const id = uid("tut");
  await db.insert(tutorSessions).values({
    id,
    learnerId: input.learnerId ?? null,
    persona: scenario.persona,
    scenario: scenario.id,
    level: input.level,
    provider: tutorProvider(),
  });
  return { id, persona: scenario.persona, scenario: scenario.id, level: input.level, provider: tutorProvider() };
}

export async function getSession(id: string) {
  const [session] = await db.select().from(tutorSessions).where(eq(tutorSessions.id, id));
  if (!session) return null;
  const messages = await db.select().from(tutorMessages).where(eq(tutorMessages.sessionId, id));
  return { session, messages };
}

export async function analyzeTurn(text: string) {
  const [patterns, lemmas] = await Promise.all([
    db.select({ id: kgGrammar.id, title: kgGrammar.title }).from(kgGrammar).limit(400),
    db.select({ id: kgLexemes.id, lemma: kgLexemes.lemma, reading: kgLexemes.reading }).from(kgLexemes).limit(600),
  ]);
  const corrections = detectCorrections(text);
  const grammar = detectGrammar(text, patterns);
  const vocabulary = detectVocabulary(text, lemmas);
  const score = scoreTurn(text, corrections, vocabulary.length);
  return { corrections, grammar, vocabulary, score };
}

export async function recordTurn(input: {
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  analysis?: Record<string, unknown>;
}) {
  await db.insert(tutorMessages).values({
    id: uid("tmsg"),
    sessionId: input.sessionId,
    role: input.role,
    content: input.content,
    analysis: input.analysis ?? null,
  });
  if (input.role === "user" && typeof input.analysis?.score === "number") {
    const [session] = await db.select().from(tutorSessions).where(eq(tutorSessions.id, input.sessionId));
    if (session) {
      const turns = session.turns + 1;
      const score = Math.round((session.score * session.turns + Number(input.analysis.score)) / turns);
      await db
        .update(tutorSessions)
        .set({ turns, score, level: nextDifficulty(session.level, score) })
        .where(eq(tutorSessions.id, session.id));
    }
  }
}

export async function listSessions(limit = 20) {
  return db.select().from(tutorSessions).orderBy(desc(tutorSessions.createdAt)).limit(limit);
}

export async function tutorStats() {
  const sessions = await listSessions(200);
  const total = sessions.length;
  const avg = total ? Math.round(sessions.reduce((sum, row) => sum + row.score, 0) / total) : 0;
  return { total, avg, provider: tutorProvider(), scenarios: SCENARIOS };
}
