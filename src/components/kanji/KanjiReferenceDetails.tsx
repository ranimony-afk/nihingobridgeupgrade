"use client";

import { useState, type ReactNode } from "react";
import { Copy, Volume2 } from "lucide-react";
import { isKanjiRouteCharacter } from "@/lib/api/routeParams";
import { isDictionaryJlptLevel } from "@/lib/dictionary/searchState";
import { buildKanjiDetailHref } from "@/lib/kanji/navigation";

export interface KanjiReferenceRecord {
  character: unknown;
  meaning?: unknown;
  readingsOn?: unknown;
  readingsKun?: unknown;
  strokeCount?: unknown;
  jlptLevel?: unknown;
  gradeLevel?: unknown;
  mnemonic?: unknown;
}

export interface KanjiReferenceRadical {
  character: unknown;
  meaning: unknown;
  category?: unknown;
}

export type KanjiCopyAction = "kanji" | "detail-link";

export interface KanjiCopyFeedback {
  message: string;
  failed: boolean;
  fallbackValue?: string;
}

function getDisplayString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getReadings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate): string[] => {
    const reading = getDisplayString(candidate);
    return reading ? [reading] : [];
  });
}

function getPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function getJlptDisplay(value: unknown): string | null {
  const level = getDisplayString(value);
  if (!level) return null;
  if (isDictionaryJlptLevel(level)) return level;
  return level === "NONE" ? "Unclassified" : null;
}

export function getKanjiCopyText(
  action: KanjiCopyAction,
  character: unknown,
  returnTo: unknown,
  origin: string
): string {
  if (!isKanjiRouteCharacter(character)) {
    throw new Error("A valid Kanji character is required.");
  }

  if (action === "kanji") return character;

  const href = buildKanjiDetailHref(character, returnTo);
  if (!href) {
    throw new Error("Could not build a safe Kanji Detail link.");
  }

  const site = new URL(origin);
  const detailUrl = new URL(href, site);
  if (
    detailUrl.origin !== site.origin ||
    (detailUrl.protocol !== "https:" && detailUrl.protocol !== "http:")
  ) {
    throw new Error("The Kanji Detail link must stay on this site.");
  }

  return detailUrl.toString();
}

export async function writeKanjiCopyText(
  text: string,
  writeText: (value: string) => Promise<void>
): Promise<boolean> {
  try {
    await writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function createKanjiCopyFeedback(
  action: KanjiCopyAction,
  copied: boolean,
  textToCopy?: string
): KanjiCopyFeedback {
  if (copied) {
    return {
      message: action === "kanji" ? "Kanji copied." : "Kanji Detail link copied.",
      failed: false,
    };
  }

  if (action === "detail-link") {
    return textToCopy
      ? {
          message:
            "Could not copy the Kanji Detail link. Select the URL below and copy it manually.",
          failed: true,
          fallbackValue: textToCopy,
        }
      : { message: "Could not build a safe Kanji Detail link.", failed: true };
  }

  return {
    message: "Could not copy the Kanji. Select the character above and copy it manually.",
    failed: true,
  };
}

export function KanjiCopyFeedbackView({
  feedback,
}: {
  feedback: KanjiCopyFeedback | null;
}) {
  if (!feedback) return null;

  return (
    <div className="space-y-2">
      <p
        role={feedback.failed ? "alert" : "status"}
        aria-live={feedback.failed ? "assertive" : "polite"}
        className={
          feedback.failed ? "text-sm text-rose-700" : "text-sm text-emerald-700"
        }
      >
        {feedback.message}
      </p>
      {feedback.fallbackValue && (
        <label className="block space-y-1 text-sm font-medium text-slate-700">
          <span>Kanji Detail URL to copy manually</span>
          <input
            type="text"
            readOnly
            value={feedback.fallbackValue}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          />
        </label>
      )}
    </div>
  );
}

function KanjiCopyActions({
  character,
  returnTo,
}: {
  character: string;
  returnTo?: string | null;
}) {
  const [feedback, setFeedback] = useState<KanjiCopyFeedback | null>(null);

  const copyValue = async (action: KanjiCopyAction) => {
    let textToCopy: string | undefined;

    try {
      if (typeof window === "undefined" || typeof navigator === "undefined") {
        setFeedback(createKanjiCopyFeedback(action, false));
        return;
      }

      textToCopy = getKanjiCopyText(
        action,
        character,
        returnTo ?? undefined,
        window.location.origin
      );
      const clipboard = navigator.clipboard;
      if (!clipboard || typeof clipboard.writeText !== "function") {
        setFeedback(createKanjiCopyFeedback(action, false, textToCopy));
        return;
      }

      const copied = await writeKanjiCopyText(textToCopy, (value) =>
        clipboard.writeText(value)
      );
      setFeedback(createKanjiCopyFeedback(action, copied, textToCopy));
    } catch {
      setFeedback(createKanjiCopyFeedback(action, false, textToCopy));
    }
  };

  const buttonClassName =
    "inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2";

  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-label="Kanji reference actions"
        className="flex flex-wrap gap-2"
      >
        <button
          type="button"
          className={buttonClassName}
          onClick={() => copyValue("kanji")}
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copy Kanji
        </button>
        <button
          type="button"
          className={buttonClassName}
          onClick={() => copyValue("detail-link")}
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copy Kanji Detail Link
        </button>
      </div>
      <KanjiCopyFeedbackView feedback={feedback} />
    </div>
  );
}

interface StoredKanjiExample {
  key: string;
  word: string;
  reading: string | null;
  meaning: string | null;
}

function getStoredKanjiExamples(value: unknown): StoredKanjiExample[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((candidate, index): StoredKanjiExample[] => {
    if (typeof candidate !== "object" || candidate === null) return [];
    const record = candidate as Record<string, unknown>;
    const word = getDisplayString(record.word);
    if (!word) return [];

    return [
      {
        key: `${word}-${index}`,
        word,
        reading: getDisplayString(record.reading),
        meaning: getDisplayString(record.meaning),
      },
    ];
  });
}

export function KanjiStoredExamples({
  examples,
  onSpeak,
}: {
  examples: unknown;
  onSpeak: (text: string) => void;
}) {
  const items = getStoredKanjiExamples(examples);
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="kanji-stored-examples-heading"
      className="mt-5 border-t border-slate-100 pt-4"
    >
      <h2
        id="kanji-stored-examples-heading"
        className="text-[11px] font-bold uppercase tracking-wider text-slate-600"
      >
        Example vocabulary stored on this kanji record
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        These display-only examples are not dictionary links; ID-backed Dictionary entries are listed separately.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {items.map((example) => (
          <li key={example.key}>
            <button
              type="button"
              onClick={() => onSpeak(example.word)}
              aria-label={`Listen to example ${example.word}${example.reading ? `, ${example.reading}` : ""}`}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            >
              <span className="font-japanese text-base font-bold text-slate-900">
                {example.word}
              </span>
              {example.reading && (
                <span className="font-japanese text-[11px] text-slate-500">
                  {example.reading}
                </span>
              )}
              {example.meaning && (
                <span className="text-[10px] text-slate-600">{example.meaning}</span>
              )}
              <Volume2 className="h-3 w-3 text-slate-300" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MetadataItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-[7rem] rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-800">{children}</dd>
    </div>
  );
}

export function KanjiReferenceDetails({
  record,
  radical,
  returnTo,
  onSpeak,
}: {
  record: KanjiReferenceRecord;
  radical?: KanjiReferenceRadical | null;
  returnTo?: string | null;
  onSpeak?: (text: string) => void;
}) {
  const character = getDisplayString(record.character);
  if (!character) return null;

  const meaning = getDisplayString(record.meaning);
  const readingsOn = getReadings(record.readingsOn);
  const readingsKun = getReadings(record.readingsKun);
  const strokeCount = getPositiveInteger(record.strokeCount);
  const gradeLevel = getPositiveInteger(record.gradeLevel);
  const jlptLevel = getJlptDisplay(record.jlptLevel);
  const mnemonic = getDisplayString(record.mnemonic);
  const radicalCharacter = getDisplayString(radical?.character);
  const radicalMeaning = getDisplayString(radical?.meaning);
  const radicalCategory = getDisplayString(radical?.category);
  const radicalLabel =
    radicalCategory === "radical"
      ? "Primary radical"
      : radicalCategory === "primitive"
        ? "Primary component"
        : "Primary element";
  const canUseKanjiRoute = isKanjiRouteCharacter(character);

  return (
    <section
      aria-labelledby="kanji-reference-heading"
      className="min-w-0 flex-1"
    >
      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-1">
          <h1
            id="kanji-reference-heading"
            className="font-japanese text-7xl font-black leading-none text-slate-900"
          >
            {character}
          </h1>
          {meaning && (
            <div className="mt-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Meaning
              </h2>
              <p className="mt-1 text-xl font-semibold text-slate-800">{meaning}</p>
            </div>
          )}
          {onSpeak && canUseKanjiRoute && (
            <button
              type="button"
              onClick={() => onSpeak(character)}
              aria-label={`Listen to kanji ${character}`}
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
            >
              <Volume2 className="h-4 w-4" aria-hidden="true" />
              Listen
            </button>
          )}
          {canUseKanjiRoute && (
            <div className="mt-3">
              <KanjiCopyActions character={character} returnTo={returnTo} />
            </div>
          )}
        </div>

        {(jlptLevel || strokeCount !== null || gradeLevel !== null || radicalCharacter) && (
          <dl
            aria-label="Kanji reference metadata"
            className="flex max-w-full flex-wrap gap-2"
          >
            {jlptLevel && (
              <MetadataItem label="JLPT">{jlptLevel}</MetadataItem>
            )}
            {gradeLevel !== null && (
              <MetadataItem label="School grade">{gradeLevel}</MetadataItem>
            )}
            {strokeCount !== null && (
              <MetadataItem label="Stroke count">{strokeCount}</MetadataItem>
            )}
            {radicalCharacter && (
              <MetadataItem label={radicalLabel}>
                <span className="font-japanese">{radicalCharacter}</span>
                {radicalMeaning && <span> — {radicalMeaning}</span>}
              </MetadataItem>
            )}
          </dl>
        )}
      </div>

      <section
        aria-labelledby="kanji-readings-heading"
        className="mt-5 border-t border-slate-100 pt-4"
      >
        <h2
          id="kanji-readings-heading"
          className="text-sm font-bold uppercase tracking-wider text-slate-600"
        >
          Readings
        </h2>
        {readingsOn.length > 0 || readingsKun.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {readingsOn.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-500">On&apos;yomi</h3>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {readingsOn.map((reading, index) => (
                    <li
                      key={`${reading}-${index}`}
                      className="rounded-lg bg-slate-50 px-2.5 py-1.5 font-japanese text-sm font-semibold text-slate-800"
                    >
                      {reading}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {readingsKun.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-slate-500">Kun&apos;yomi</h3>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {readingsKun.map((reading, index) => (
                    <li
                      key={`${reading}-${index}`}
                      className="rounded-lg bg-slate-50 px-2.5 py-1.5 font-japanese text-sm font-semibold text-slate-800"
                    >
                      {reading}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            No reading data is available for this character.
          </p>
        )}
      </section>

      {mnemonic && (
        <section aria-labelledby="kanji-memory-aid-heading" className="mt-4">
          <h2
            id="kanji-memory-aid-heading"
            className="text-xs font-bold uppercase tracking-wider text-slate-500"
          >
            Memory aid
          </h2>
          <p className="mt-1 max-w-prose rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
            {mnemonic}
          </p>
        </section>
      )}
    </section>
  );
}
