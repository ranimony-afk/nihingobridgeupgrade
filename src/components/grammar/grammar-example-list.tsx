"use client";

import { useMemo, useState } from "react";

import type { GrammarExample } from "@/types/grammar";

/**
 * Interactive corpus-evidence list.
 *
 * The highlight ranges come from `grammar_example_matches`, so the interface can
 * never highlight something the ETL did not actually match.
 */
export function GrammarExampleList({
  examples,
  initialReveal = true,
}: {
  examples: GrammarExample[];
  initialReveal?: boolean;
}) {
  const [reveal, setReveal] = useState(initialReveal);
  const [maxLength, setMaxLength] = useState<number | null>(null);

  const longest = useMemo(
    () => examples.reduce((max, example) => Math.max(max, example.length), 0),
    [examples],
  );

  const visible = useMemo(
    () => (maxLength ? examples.filter((example) => example.length <= maxLength) : examples),
    [examples, maxLength],
  );

  return (
    <div className="space-y-4" data-testid="grammar-examples">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <button
          type="button"
          onClick={() => setReveal((value) => !value)}
          className="rounded-full border border-slate-300 px-3 py-1 font-medium text-slate-700 transition hover:border-slate-900"
        >
          {reveal ? "Hide translations" : "Show translations"}
        </button>

        <label className="flex items-center gap-2">
          Max length
          <input
            type="range"
            min={8}
            max={Math.max(longest, 10)}
            value={maxLength ?? longest}
            onChange={(event) => {
              const value = Number(event.target.value);
              setMaxLength(value >= longest ? null : value);
            }}
            className="accent-indigo-600"
            aria-label="Maximum sentence length"
          />
          <span className="w-10 text-slate-700">{maxLength ?? "any"}</span>
        </label>

        <span className="ml-auto">
          {visible.length} of {examples.length} sentences
        </span>
      </div>

      <ul className="divide-y divide-slate-100">
        {visible.map((example) => (
          <li key={example.id} className="py-3">
            <p className="jp text-base text-slate-900">
              {renderHighlighted(example)}
            </p>
            <p
              className={`mt-1 text-sm text-slate-600 transition ${
                reveal ? "" : "select-none blur-[5px]"
              }`}
              aria-hidden={!reveal}
            >
              {example.english}
            </p>
            {example.externalId ? (
              <p className="mt-0.5 text-[10px] text-slate-400">Tanaka #{example.externalId}</p>
            ) : null}
          </li>
        ))}
      </ul>

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
          No sentence is shorter than {maxLength} characters.
        </p>
      ) : null}
    </div>
  );
}

function renderHighlighted(example: GrammarExample) {
  const ranges = [...example.matches].sort((a, b) => a.startIndex - b.startIndex);
  const parts: Array<{ text: string; highlight: boolean }> = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.startIndex < cursor) continue;
    if (range.startIndex > cursor) {
      parts.push({ text: example.japanese.slice(cursor, range.startIndex), highlight: false });
    }
    parts.push({
      text: example.japanese.slice(range.startIndex, range.endIndex),
      highlight: true,
    });
    cursor = range.endIndex;
  }
  if (cursor < example.japanese.length) {
    parts.push({ text: example.japanese.slice(cursor), highlight: false });
  }

  if (parts.length === 0) return example.japanese;

  return parts.map((part, index) =>
    part.highlight ? (
      <mark key={index} className="rounded bg-amber-200/80 px-0.5 text-slate-900">
        {part.text}
      </mark>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  );
}
