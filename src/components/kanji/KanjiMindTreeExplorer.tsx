"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { MindTreeAnnotation, MindTreeEntry } from "@/lib/kanji/kanjiMindtreeCatalog";
import { KanjiMindTreeLearningJourney } from "@/components/kanji/KanjiMindTreeLearningJourney";
import type { MindTreeGraphEdge, MindTreeGraphNode } from "@/lib/kanji/learningGraph";
import { mindTreeExploreHref } from "@/lib/kanji/mindtreeLearningJourney";

function readingList(label: string, readings: string[], emptyMessage: string) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{label}</h3>
      {readings.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {readings.map((reading) => (
            <li key={reading} className="rounded-lg bg-white px-2.5 py-1.5 font-japanese text-sm font-semibold text-slate-800 ring-1 ring-slate-200" lang="ja">{reading}</li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm text-slate-500">{emptyMessage}</p>}
    </div>
  );
}

function ComponentTree({ entry, selectedId, onSelect }: {
  entry: MindTreeEntry;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const childrenByParent = new Map<string | null, MindTreeAnnotation[]>();
  for (const annotation of entry.annotations) {
    const bucket = childrenByParent.get(annotation.parentOccurrenceId) ?? [];
    bucket.push(annotation);
    childrenByParent.set(annotation.parentOccurrenceId, bucket);
  }

  const renderChildren = (parentId: string | null, visited: Set<string>): ReactNode => {
    const children = childrenByParent.get(parentId) ?? [];
    if (!children.length) return null;
    return (
      <ul className="list-none space-y-1.5 p-0">
        {children.map((annotation) => {
          if (visited.has(annotation.occurrenceId)) return null;
          const nextVisited = new Set(visited);
          nextVisited.add(annotation.occurrenceId);
          const isSelected = selectedId === annotation.occurrenceId;
          const label = annotation.componentCharacter ?? annotation.renderedAs;
          const nestedChildren = renderChildren(annotation.occurrenceId, nextVisited);
          return (
            <li key={annotation.occurrenceId}>
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`Select source component ${label}${annotation.position ? `, ${annotation.position}` : ""}`}
                  onClick={() => onSelect(annotation.occurrenceId)}
                  className={`flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 ${isSelected ? "border-rose-500 bg-rose-50 ring-1 ring-rose-200" : "border-slate-200 bg-white hover:border-slate-300"}`}
                >
                  <span className={`font-japanese flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl ${isSelected ? "bg-rose-600 text-white" : "bg-slate-100 text-slate-900"}`} lang="ja">{label}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">{annotation.renderedAs}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-500">KanjiVG kvg:element{annotation.position ? ` · kvg:position=${annotation.position}` : ""} · {annotation.sourcePathCount} linked path{annotation.sourcePathCount === 1 ? "" : "s"}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">{isSelected ? "Selected" : "Select"}</span>
                </button>
                {annotation.supportedCharacter && annotation.componentCharacter ? (
                  <Link
                    href={mindTreeExploreHref(entry.character, annotation.componentCharacter, `component ${annotation.renderedAs}`)}
                    aria-label={`Open MindTree for ${annotation.componentCharacter}, following component ${annotation.renderedAs} from ${entry.character}`}
                    className="flex min-h-12 shrink-0 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-rose-300 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2"
                  >Open</Link>
                ) : null}
              </div>
              {nestedChildren ? <div className="ml-4 mt-1.5 border-l border-slate-200 pl-3">{nestedChildren}</div> : null}
            </li>
          );
        })}
      </ul>
    );
  };

  if (!entry.annotations.length) return <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">This SVG has no nested `kvg:element` groups in the bounded annotation view.</p>;
  return <>{renderChildren(null, new Set())}</>;
}

function LearningGraphPanel({ entry }: { entry: MindTreeEntry }) {
  const nodeById = new Map(entry.learningGraph.nodes.map((node) => [node.id, node]));
  const componentEdges = entry.learningGraph.edges.filter((edge) => edge.relation === "has-visual-annotation");
  const readingEdges = entry.learningGraph.edges.filter((edge) => edge.relation === "has-recorded-reading");
  const relatedReadingEdges = entry.learningGraph.edges.filter((edge) => edge.relation === "shares-recorded-on-reading");
  const exampleEdges = entry.learningGraph.edges.filter((edge) => edge.relation === "has-first-party-example");

  const renderCharacterTarget = (edge: MindTreeGraphEdge, node: MindTreeGraphNode | undefined, via: string) => {
    if (!node || node.kind !== "kanji") return null;
    return (
      <li key={edge.id} className="rounded-xl border border-slate-200 bg-white p-3">
        <Link href={mindTreeExploreHref(entry.character, node.character, via)} className="inline-flex min-h-10 items-center gap-2 rounded-lg pr-2 font-bold text-violet-900 underline decoration-violet-300 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700">
          <span lang="ja" className="font-japanese text-2xl">{node.character}</span><span>{node.meaning}</span><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-slate-600">{node.meaningSourceRef === entry.firstPartySourceRef ? "study" : "dictionary"}</span><span aria-hidden="true">→</span>
        </Link>
        <p className="mt-1 text-xs leading-5 text-slate-600">{edge.explanation}</p>
      </li>
    );
  };

  return (
    <section aria-labelledby="learning-graph-title" className="mt-5 rounded-3xl border border-violet-200 bg-violet-50/50 p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-800">Interactive learning graph · separate from structural evidence</p>
          <h2 id="learning-graph-title" className="mt-1 text-xl font-extrabold">Explore this character&apos;s neighborhood</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">A server-composed, one-character neighborhood with bounded component-family branches. Every connection names its evidence lane; nothing is traversed recursively.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-violet-900">{entry.learningGraph.nodes.length} nodes · {entry.learningGraph.edges.length} links · depth ≤ {entry.learningGraph.maxDepth}</span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <section aria-labelledby="graph-components-title" className="rounded-2xl border border-violet-100 bg-white p-4">
          <h3 id="graph-components-title" className="text-sm font-extrabold">Visual component families</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">Expand a source annotation to see a few indexed characters. The family is literal KanjiVG overlap, not a semantic family.</p>
          {componentEdges.length ? (
            <ul className="mt-3 list-none space-y-2 p-0">
              {componentEdges.map((edge) => {
                const component = nodeById.get(edge.to);
                if (!component || component.kind !== "component") return null;
                const familyEdges = entry.learningGraph.edges.filter((candidate) => candidate.from === component.id && candidate.relation === "shares-visual-annotation");
                return (
                  <li key={edge.id}>
                    <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <summary className="min-h-9 cursor-pointer list-inside font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-700">
                        <span lang="ja" className="font-japanese text-lg">{component.label}</span><span className="ml-2 text-xs font-semibold text-slate-500">{component.occurrenceCount} occurrence{component.occurrenceCount === 1 ? "" : "s"}</span>
                      </summary>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{edge.explanation}</p>
                      {familyEdges.length ? (
                        <ul className="mt-2 list-none space-y-2 p-0">
                          {familyEdges.map((familyEdge) => renderCharacterTarget(familyEdge, nodeById.get(familyEdge.to), `component ${component.label}`))}
                        </ul>
                      ) : <p className="mt-2 text-xs text-slate-500">No other supported character shares this exact annotation in the current slice.</p>}
                    </details>
                  </li>
                );
              })}
            </ul>
          ) : <p className="mt-3 text-sm text-slate-600">No component-family branches are available.</p>}
        </section>

        <div className="space-y-3">
          <section aria-labelledby="graph-reading-title" className="rounded-2xl border border-violet-100 bg-white p-4">
            <h3 id="graph-reading-title" className="text-sm font-extrabold">Recorded readings and sound overlap</h3>
            {readingEdges.length ? <ul className="mt-2 flex flex-wrap gap-2">{readingEdges.map((edge) => {
              const reading = nodeById.get(edge.to);
              return reading?.kind === "reading" ? <li key={edge.id} lang="ja" className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-bold text-sky-950"><span className="text-[10px] font-extrabold uppercase text-sky-700">{reading.readingType}</span> · {reading.label}</li> : null;
            })}</ul> : <p className="mt-2 text-sm text-slate-600">No reading nodes are available.</p>}
            {relatedReadingEdges.length ? (
              <>
                <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Same exact KANJIDIC2 On-reading</p>
                <ul className="mt-2 list-none space-y-2 p-0">{relatedReadingEdges.map((edge) => renderCharacterTarget(edge, nodeById.get(edge.to), `On-reading ${edge.label}`))}</ul>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">Sound overlap does not imply semantic, etymological, or historical kinship.</p>
              </>
            ) : null}
          </section>

          {exampleEdges.length ? (
            <section aria-labelledby="graph-vocabulary-title" className="rounded-2xl border border-violet-100 bg-white p-4">
              <h3 id="graph-vocabulary-title" className="text-sm font-extrabold">First-party vocabulary nodes</h3>
              <ul className="mt-2 list-none space-y-2 p-0">{exampleEdges.map((edge) => {
                const example = nodeById.get(edge.to);
                return example?.kind === "vocabulary" ? <li key={edge.id} className="rounded-xl bg-sky-50 p-3"><p lang="ja" className="font-japanese text-lg font-bold text-slate-900">{example.label}</p><p className="mt-1 text-xs text-slate-600"><span lang="ja" className="font-japanese">{example.reading}</span> · {example.meaning}</p><p className="mt-1 text-[11px] text-slate-500">NihongoBridge first-party study example; not a JMdict row.</p></li> : null;
              })}</ul>
            </section>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-slate-500">Graph contract: {entry.learningGraph.graphVersion}; maximum {entry.learningGraph.maxNodes} nodes and depth {entry.learningGraph.maxDepth}. This composed learning view never changes the canonical structural evidence graph.</p>
    </section>
  );
}

export function KanjiMindTreeExplorer({ entry, context }: { entry: MindTreeEntry; context?: { from?: string; via?: string } }) {
  const [selectedId, setSelectedId] = useState<string | null>(entry.annotations[0]?.occurrenceId ?? null);
  const selectedAnnotation = entry.annotations.find((item) => item.occurrenceId === selectedId) ?? null;
  const meaningIsFirstParty = entry.meaningSourceRef === entry.firstPartySourceRef;
  const gradeLabel = entry.dictionaryFacts.gradeLevel ? `Jōyō grade ${entry.dictionaryFacts.gradeLevel}` : "Grade not listed";

  return (
    <main className="min-h-screen bg-[#f6f7f8] px-4 py-7 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <Link href="/mindtree" className="rounded underline decoration-slate-300 underline-offset-4 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600">MindTree catalog</Link>
          <span aria-hidden="true">/</span><span className="font-japanese text-slate-800" lang="ja">{entry.character}</span>
          {context?.from && Array.from(context.from).length === 1 ? <><span aria-hidden="true">·</span><span>Following {context.via || "a learning-graph link"} from <Link href={`/mindtree/${encodeURIComponent(context.from)}`} className="font-japanese text-slate-800 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600" lang="ja">{context.from}</Link></span></> : null}
        </nav>

        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-rose-700">Character study · {entry.jlptLevel ?? gradeLabel}</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
              <h1 className="font-japanese text-6xl font-medium leading-none tracking-normal text-slate-950 sm:text-7xl" lang="ja">{entry.character}</h1>
              <div className="pb-1">
                <p className="text-2xl font-black tracking-tight sm:text-3xl">{entry.meaning}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{meaningIsFirstParty ? "NihongoBridge first-party study meaning" : "KANJIDIC2 English meaning"} · not inferred from the graphic</p>
              </div>
            </div>
          </div>
          <Link href={`/kanji/${encodeURIComponent(entry.character)}`} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:border-rose-300 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2">Open existing Kanji tools</Link>
        </header>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-indigo-800">Source markup</p>
            <p className="mt-1 text-sm font-bold text-slate-900">KanjiVG stroke paths + group labels</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">Direct visual annotations; not semantic, radical-identity, or historical analysis.</p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-sky-800">Dictionary facts</p>
            <p className="mt-1 text-sm font-bold text-slate-900">KANJIDIC2 · {gradeLabel} · {entry.dictionaryFacts.strokeCount} strokes</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">English glosses, Japanese readings, grade, and stroke count from a separate attributed dataset.</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-amber-900">Memory aid</p>
            <p className="mt-1 text-sm font-bold text-slate-900">A cue is not etymology</p>
            <p className="mt-1 text-xs font-bold text-amber-900">{entry.mnemonicAvailability === "published" ? "Published memory aid" : entry.mnemonicAvailability === "release-authorization-missing" ? "Legacy published status · release evidence missing · hidden" : entry.mnemonicAvailability === "review-pending" ? "Review pending · hidden" : entry.mnemonicAvailability === "draft" ? "Unsubmitted draft · hidden" : entry.mnemonicAvailability === "approved-unpublished" ? "Approved · not published" : entry.mnemonicAvailability === "archived-unpublished" ? "Archived · hidden" : "No mnemonic coverage"}</p>
            <p className="mt-1 text-xs leading-5 text-slate-700">M6 has no authenticated release gate, so no MindTree stories reach this learner route. A legacy published status alone is insufficient; drafts stay in the local studio, and missing stories are never generated.</p>
          </div>
        </div>

        <KanjiMindTreeLearningJourney entry={entry} />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.06fr)_minmax(0,0.94fr)]">
          <section aria-labelledby="structure-title" className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">Visual evidence</p><h2 id="structure-title" className="mt-1 text-xl font-extrabold">Explore the annotated structure</h2></div>
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">{entry.evidence.paths.length} source paths</span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Select a labeled occurrence to highlight its KanjiVG paths. Repeated shapes remain separate occurrences. The hierarchy is the SVG&apos;s grouping, not a claim about meaning or origin.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.2fr)] md:items-start">
              <figure className="flex flex-col items-center rounded-2xl bg-slate-50 p-4">
                <svg viewBox={entry.evidence.viewBox} role="img" aria-labelledby="kanji-svg-title" className="h-auto w-full max-w-[260px] select-none">
                  <title id="kanji-svg-title">{`KanjiVG stroke paths for ${entry.character}`}</title>
                  {entry.evidence.paths.map((path) => {
                    const active = path.componentOccurrenceId !== null && path.componentOccurrenceId === selectedId;
                    const anotherOccurrence = selectedId !== null && path.componentOccurrenceId !== null && !active;
                    return <path key={path.sourcePathId} d={path.pathData} fill="none" stroke={active ? "#e11d48" : "#334155"} strokeWidth={active ? entry.evidence.sourceStrokeWidth + 0.8 : entry.evidence.sourceStrokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={anotherOccurrence ? 0.34 : 1} vectorEffect="non-scaling-stroke" />;
                  })}
                </svg>
                <figcaption className="mt-3 text-center text-xs text-slate-500">Highlight color is paired with a selected label; animation is not required.</figcaption>
              </figure>
              <div><h3 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Source component occurrences</h3><ComponentTree entry={entry} selectedId={selectedId} onSelect={setSelectedId} /></div>
            </div>
            {selectedAnnotation ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/70 p-4" aria-live="polite">
                <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-rose-800">Selected occurrence</p>
                <p className="mt-1 font-japanese text-xl font-bold text-slate-900" lang="ja">{selectedAnnotation.renderedAs}</p>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div><dt className="font-bold text-slate-500">KanjiVG kvg:element</dt><dd className="mt-0.5 break-all font-mono text-slate-800">{selectedAnnotation.renderedAs}</dd></div>
                  <div><dt className="font-bold text-slate-500">Source group ID</dt><dd className="mt-0.5 break-all font-mono text-slate-800">{selectedAnnotation.sourceGroupId}</dd></div>
                  {selectedAnnotation.position ? <div><dt className="font-bold text-slate-500">KanjiVG kvg:position</dt><dd className="mt-0.5 font-mono text-slate-800">{selectedAnnotation.position}</dd></div> : null}
                  {selectedAnnotation.radicalMarker ? <div><dt className="font-bold text-slate-500">KanjiVG kvg:radical annotation</dt><dd className="mt-0.5 font-mono text-slate-800">{selectedAnnotation.radicalMarker}</dd></div> : null}
                  {selectedAnnotation.phoneticMarker ? <div><dt className="font-bold text-slate-500">KanjiVG kvg:phon annotation</dt><dd className="mt-0.5 font-mono text-slate-800">{selectedAnnotation.phoneticMarker}</dd></div> : null}
                  {selectedAnnotation.firstPartyElement ? <div className="sm:col-span-2"><dt className="font-bold text-slate-500">Separate first-party element note</dt><dd className="mt-0.5 text-slate-800">{selectedAnnotation.firstPartyElement.character} — {selectedAnnotation.firstPartyElement.meaning} ({selectedAnnotation.firstPartyElement.category}). This is an authored study label, not a conclusion from KanjiVG.</dd></div> : null}
                </dl>
              </div>
            ) : null}
          </section>

          <div className="space-y-5">
            <section aria-labelledby="readings-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">{entry.readingSourceRef === entry.firstPartySourceRef ? "First-party study seed" : "KANJIDIC2 dictionary facts"}</p><h2 id="readings-title" className="mt-1 text-xl font-extrabold">Readings</h2></div><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{entry.strokeCount} {entry.strokeCountSourceRef === entry.firstPartySourceRef ? "seed" : "dictionary"} strokes</span></div>
              <div className="mt-4 space-y-4">{readingList("Kun readings", entry.readingsKun, "Not listed in this source record.")}{readingList("On readings", entry.readingsOn, "Not listed in this source record.")}</div>
              {entry.primaryRadical ? <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Separate first-party radical selection</p><p className="mt-1 font-japanese text-sm font-bold text-slate-900" lang="ja">{entry.primaryRadical.character} · {entry.primaryRadical.meaning}</p><p className="mt-1 text-xs text-slate-600">This catalog field is not inferred from the highlighted KanjiVG group or KANJIDIC2 radical index number.</p></div> : null}
              <details className="mt-4 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
                <summary className="min-h-9 cursor-pointer font-bold text-sky-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700">Separate KANJIDIC2 reference facts</summary>
                <div className="mt-3 space-y-3 text-xs leading-5 text-slate-700">
                  <div><p className="font-bold">English meanings</p><ul className="mt-1 list-disc pl-5">{entry.dictionaryFacts.meaningsEnglish.map((meaning) => <li key={meaning}>{meaning}</li>)}</ul></div>
                  {readingList("KANJIDIC2 Kun readings", entry.dictionaryFacts.readingsKun, "None listed.")}
                  {readingList("KANJIDIC2 On readings", entry.dictionaryFacts.readingsOn, "None listed.")}
                  <p>Grade: {entry.dictionaryFacts.gradeLevel ?? "not listed"} · Stroke count: {entry.dictionaryFacts.strokeCount} · Classical radical index number: {entry.dictionaryFacts.classicalRadicalNumber ?? "not listed"}.</p>
                  <p>Source: KANJIDIC2, EDRDG · CC BY-SA 4.0 · <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noreferrer" className="font-semibold text-sky-900 underline">license and attribution</a>.</p>
                </div>
              </details>
            </section>

            <section aria-labelledby="vocabulary-title" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">First-party study examples</p><h2 id="vocabulary-title" className="mt-1 text-xl font-extrabold">Vocabulary</h2></div>
              {entry.vocabulary.length ? <ul className="mt-4 space-y-2">{entry.vocabulary.map((item) => <li key={`${item.word}-${item.reading}`} className="rounded-xl border border-slate-200 p-3"><p className="font-japanese text-lg font-bold text-slate-900" lang="ja">{item.word}</p><p className="mt-0.5 text-xs text-slate-500"><span className="font-japanese" lang="ja">{item.reading}</span> · {item.meaning}</p></li>)}</ul> : <p className="mt-3 text-sm text-slate-600">No first-party vocabulary example is recorded for this character.</p>}
              <p className="mt-3 text-xs leading-5 text-slate-500">These examples are not copied from JMdict and are not presented as dictionary-verified entries. Use the existing NihongoBridge dictionary route for richer lookup.</p>
              <Link href={`/kanji/${encodeURIComponent(entry.character)}`} className="mt-3 inline-flex min-h-10 items-center rounded-lg text-sm font-bold text-sky-800 underline decoration-sky-300 underline-offset-4 hover:text-sky-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700">Open existing dictionary-backed Kanji details →</Link>
            </section>
          </div>
        </div>

        <LearningGraphPanel entry={entry} />

        <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-sm sm:p-5">
          <summary className="cursor-pointer font-bold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700">Source, hashes, and provenance details</summary>
          <div className="mt-4 grid gap-4 text-xs leading-5 text-slate-600 md:grid-cols-3">
            <div><h2 className="font-bold text-slate-800">Visual evidence</h2><p className="mt-1">KanjiVG {entry.evidence.graph.provenance.sourceVersion}; <code className="break-all">{entry.evidence.sourceFile}</code>.</p><p className="mt-1">Source-file SHA-256: <code className="break-all">{entry.evidence.sourceFileSha256}</code>.</p><p className="mt-1">Canonical graph SHA-256: <code className="break-all">{entry.evidence.graphCanonicalSha256}</code>.</p><p className="mt-1">CC BY-SA 3.0 · adapted from KanjiVG by Ulrich Apel. <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noreferrer" className="font-semibold text-indigo-800 underline">Attribution</a>.</p></div>
            <div><h2 className="font-bold text-slate-800">Dictionary facts</h2><p className="mt-1">{entry.dictionaryFacts.sourceRef} · {entry.dictionaryFacts.license}.</p><p className="mt-1">Pinned archive commit <code>{"9cb709b87f43c7bceb494eefbe7f8b8f42744502"}</code>; XML SHA-256 <code className="break-all">{"260e6119fcc78cde438de7d7f8227d1c13260469d10ae36a01d866c61f7cc781"}</code>.</p><p className="mt-1">English meanings and Japanese On/Kun readings only; non-English meanings and third-party code systems are excluded. <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noreferrer" className="font-semibold text-sky-900 underline">EDRDG license notice</a>.</p></div>
            <div><h2 className="font-bold text-slate-800">First-party content &amp; derived links</h2><p className="mt-1">Study seed: <code>{entry.firstPartySourceRef ?? "not present for this character"}</code>. Vocabulary and memory cues remain first-party.</p><p className="mt-1">Only explicitly published non-AI records are returned to this learner page. Draft and AI-candidate overlays are hidden; missing mnemonics are not generated.</p><p className="mt-1">Component-family and shared-On-reading links are deterministic derived relationships, separately labeled and bounded; no JMdict rows or learner-state storage is used.</p></div>
          </div>
          <p className="mt-4 border-t border-slate-200 pt-3 text-[11px] leading-5 text-slate-500">Declared hashes and structural validation describe the checked-in artifacts; they do not contact upstream hosts at runtime, guarantee linguistic correctness, or constitute legal clearance.</p>
        </details>
      </div>
    </main>
  );
}
