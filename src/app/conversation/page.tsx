import Link from "next/link";
import { db } from "@/db";
import { conversationLessons } from "@/db/schema";
import { ensureSeed } from "@/lib/seed";
import { BrandHeader } from "@/shared/components/BrandHeader";
import { getBrand } from "@/lib/brands";
import { ConversationLabClient } from "./ConversationLabClient";

export const dynamic = "force-dynamic";

export default async function ConversationLabPage() {
  await ensureSeed();
  const cfg = getBrand("nihongo")!;
  const lessons = await db.select().from(conversationLessons);

  return (
    <main
      className="min-h-screen px-6 py-10"
      style={{ background: cfg.theme.surface, color: cfg.theme.text }}
    >
      <div className="mx-auto max-w-5xl space-y-8">
        <BrandHeader brand={cfg} />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: cfg.theme.primary }}>
              Interactive Conversation Lab 🗣️
            </h1>
            <p className="mt-1 text-sm opacity-80">
              Line-by-line situational dialogues, audio playback, grammar notes, pronunciation verification, and role-play practice.
            </p>
          </div>
        </div>

        <ConversationLabClient initialLessons={lessons as never} />
      </div>
    </main>
  );
}
