"use client";

import Link from "next/link";
import { useReducer } from "react";
import type { MindTreeEntry } from "@/lib/kanji/kanjiMindtreeCatalog";
import {
  INITIAL_MINDTREE_JOURNEY_STATE,
  MINDTREE_JOURNEY_STAGES,
  mindTreeJourneyReducer,
  mindTreeExploreHref,
  segmentMnemonicStory,
  type MindTreeJourneyAction,
  type MindTreeJourneyState,
} from "@/lib/kanji/mindtreeLearningJourney";

type Dispatch = (action: MindTreeJourneyAction) => void;

function RecallPractice({ entry, state, dispatch }: { entry: MindTreeEntry; state: MindTreeJourneyState; dispatch: Dispatch }) {
  const mode = state.recallMode;
  const prompt = mode === "meaning"
    ? "Recall the core meaning without looking at the answer."
    : "Recall one source-annotated component in this character.";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap gap-2" aria-label="Recall activity type">
        <button type="button" aria-pressed={mode === "meaning"} onClick={() => dispatch({ type: "set-recall-mode", mode: "meaning" })} className={`min-h-10 rounded-lg px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 ${mode === "meaning" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>Meaning recall</button>
        <button type="button" aria-pressed={mode === "components"} onClick={() => dispatch({ type: "set-recall-mode", mode: "components" })} className={`min-h-10 rounded-lg px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 ${mode === "components" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>Component recall</button>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-800">{prompt}</p>
      <p className="mt-1 text-xs text-slate-500">Answer aloud or silently; this check stays in this page session and is not saved.</p>
      <button type="button" onClick={() => dispatch({ type: state.answerVisible ? "hide-answer" : "reveal-answer" })} className="mt-4 min-h-11 rounded-xl bg-rose-700 px-4 text-sm font-bold text-white hover:bg-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2">{state.answerVisible ? "Cover answer" : "Reveal answer"}</button>
      {state.answerVisible ? (
        <div className="mt-3 rounded-xl bg-rose-50 p-4" aria-live="polite">
          {mode === "meaning" ? (
            <p className="text-lg font-extrabold text-slate-900">{entry.meaning}<span className="ml-2 text-xs font-semibold text-slate-500">· {entry.meaningSourceRef === entry.firstPartySourceRef ? "first-party study seed" : "KANJIDIC2 English meaning"}</span></p>
          ) : entry.annotations.length ? (
            <ul className="flex flex-wrap gap-2">{[...new Set(entry.annotations.map((annotation) => annotation.renderedAs))].map((component) => <li key={component} lang="ja" className="rounded-lg bg-white px-3 py-2 font-japanese text-xl font-bold text-slate-900 ring-1 ring-rose-200">{component}</li>)}</ul>
          ) : <p className="text-sm text-slate-700">No annotated component is available for this entry.</p>}
          {mode === "components" ? <p className="mt-2 text-xs leading-5 text-slate-600">These are literal KanjiVG visual annotations, not semantic roles or etymology.</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" aria-pressed={state.selfCheck === "recalled"} onClick={() => dispatch({ type: "self-check", result: "recalled" })} className={`min-h-10 rounded-lg px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${state.selfCheck === "recalled" ? "bg-emerald-700 text-white" : "bg-white text-emerald-900 ring-1 ring-emerald-300"}`}>I recalled it</button>
            <button type="button" aria-pressed={state.selfCheck === "review"} onClick={() => dispatch({ type: "self-check", result: "review" })} className={`min-h-10 rounded-lg px-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 ${state.selfCheck === "review" ? "bg-amber-700 text-white" : "bg-white text-amber-900 ring-1 ring-amber-300"}`}>I need another look</button>
          </div>
          <p className="mt-3 min-h-5 text-xs font-semibold text-slate-700" aria-live="polite">{state.selfCheck === "recalled" ? "Nice work. This result is temporary and will not create a review card." : state.selfCheck === "review" ? "Take another look at the source and study cues above; nothing is stored." : "Choose a self-check if useful."}</p>
        </div>
      ) : null}
    </div>
  );
}

export function KanjiMindTreeLearningJourney({ entry }: { entry: MindTreeEntry }) {
  const [state, dispatch] = useReducer(mindTreeJourneyReducer, INITIAL_MINDTREE_JOURNEY_STATE);
  const stage = state.stage;
  const stageIndex = MINDTREE_JOURNEY_STAGES.indexOf(stage);
  const storyParts = entry.mnemonic ? segmentMnemonicStory(entry.mnemonic.story) : [];
  const mnemonicUnavailableMessage = entry.mnemonicAvailability === "release-authorization-missing"
    ? "A legacy published status is present, but there is no authenticated release authorization; the mnemonic text remains hidden."
    : entry.mnemonicAvailability === "review-pending"
      ? "A mnemonic is currently in editorial review and is not shown to learners."
    : entry.mnemonicAvailability === "draft"
      ? "A mnemonic draft exists but has not been submitted or approved; its text is hidden from learners."
      : entry.mnemonicAvailability === "approved-unpublished"
        ? "A mnemonic has approval recorded but is not published, so its text remains hidden from learners."
        : entry.mnemonicAvailability === "archived-unpublished"
          ? "The mnemonic record is archived and is not shown to learners."
          : "No mnemonic content is recorded for this supported character yet. MindTree will not generate or infer a story from dictionary facts or stroke markup.";
  const nextStage = MINDTREE_JOURNEY_STAGES[stageIndex + 1];

  return (
    <section aria-labelledby="learning-journey-title" className="mb-5 rounded-3xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-rose-800">A short, ephemeral study path</p>
          <h2 id="learning-journey-title" className="mt-1 text-xl font-extrabold text-slate-950">Observe → Break down → Associate → Remember → Recall → Explore</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">Move through the cues at your pace. No progress, answer, or review schedule is saved.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-600">Step {stageIndex + 1} of {MINDTREE_JOURNEY_STAGES.length}</span>
      </div>

      <ol className="mt-4 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-6" aria-label="Learning journey steps">
        {MINDTREE_JOURNEY_STAGES.map((item, index) => (
          <li key={item}><button type="button" aria-current={stage === item ? "step" : undefined} onClick={() => dispatch({ type: "set-stage", stage: item })} className={`min-h-11 w-full rounded-xl px-3 text-left text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 ${stage === item ? "bg-rose-800 text-white" : "bg-white text-slate-700 ring-1 ring-rose-100 hover:bg-rose-100"}`}><span className="mr-1.5 opacity-70">{index + 1}.</span>{item}</button></li>
        ))}
      </ol>

      <div className="mt-4 rounded-2xl bg-white p-4 sm:p-5" aria-live="polite">
        {stage === "Observe" ? <div><h3 className="text-base font-extrabold">Look at the whole character first</h3><p className="mt-1 text-sm leading-6 text-slate-700">Notice the silhouette and say the displayed meaning once. The drawing below is source markup; the meaning is separately attributed to {entry.meaningSourceRef === entry.firstPartySourceRef ? "the NihongoBridge first-party seed" : "KANJIDIC2"}.</p></div> : null}
        {stage === "Break down" ? <div><h3 className="text-base font-extrabold">Inspect annotated pieces</h3>{entry.annotations.length ? <ul className="mt-3 flex flex-wrap gap-2">{[...new Set(entry.annotations.map((annotation) => annotation.renderedAs))].map((part) => <li key={part} lang="ja" className="rounded-lg bg-indigo-50 px-3 py-2 font-japanese text-xl font-bold text-indigo-950">{part}</li>)}</ul> : <p className="mt-2 text-sm text-slate-600">No component annotation is available.</p>}<p className="mt-2 text-xs leading-5 text-slate-500">KanjiVG&apos;s literal grouping is a visual source annotation. It does not define the parts&apos; meaning or historical role.</p></div> : null}
        {stage === "Associate" ? <div><h3 className="text-base font-extrabold">Build a memory association</h3>{entry.mnemonic ? <><p className="mt-1 text-sm text-slate-600">Reveal this published memory aid in small pieces.</p>{state.revealedStoryParts > 0 ? <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-slate-800">{storyParts.slice(0, state.revealedStoryParts).join(" ")}</p> : null}{state.revealedStoryParts < storyParts.length ? <button type="button" onClick={() => dispatch({ type: "reveal-next-story-part", partCount: storyParts.length })} className="mt-3 min-h-11 rounded-xl bg-amber-700 px-4 text-sm font-bold text-white hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2">{state.revealedStoryParts === 0 ? "Reveal first story cue" : `Reveal next cue (${state.revealedStoryParts + 1} of ${storyParts.length})`}</button> : <p className="mt-3 text-xs font-semibold text-amber-900">All story cues revealed.</p>}<p className="mt-3 text-xs leading-5 text-slate-600">Published {entry.mnemonic.origin.replaceAll("_", " ")} memory aid · not etymology. Source refs: {entry.mnemonic.sourceReferences.join(", ")}.</p></> : <p className="mt-2 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{mnemonicUnavailableMessage}</p>}</div> : null}
        {stage === "Remember" ? <div><h3 className="text-base font-extrabold">Cover the story and recall it</h3>{entry.mnemonic ? <><p className="mt-1 text-sm leading-6 text-slate-700">Take a moment to retell the association from memory, then reveal it to check.</p>{!state.storyVisible ? <button type="button" onClick={() => dispatch({ type: "toggle-story", visible: true })} className="mt-3 min-h-11 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-bold text-amber-950 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700">Reveal memory story</button> : <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm leading-6 text-slate-800">{entry.mnemonic.story}</p>}{state.storyVisible ? <button type="button" onClick={() => dispatch({ type: "toggle-story", visible: false })} className="mt-2 min-h-10 rounded-lg px-3 text-sm font-bold text-amber-900 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700">Hide story again</button> : null}</> : <p className="mt-2 text-sm text-slate-700">{mnemonicUnavailableMessage}</p>}</div> : null}
        {stage === "Recall" ? <div><h3 className="text-base font-extrabold">Quick self-check</h3><p className="mt-1 mb-3 text-sm text-slate-600">Choose a recall prompt. Your self-rating is temporary and has no SRS or account effect.</p><RecallPractice entry={entry} state={state} dispatch={dispatch} /></div> : null}
        {stage === "Explore" ? <div><h3 className="text-base font-extrabold">Explore evidence-backed neighbors</h3><p className="mt-1 text-sm leading-6 text-slate-700">Follow recorded readings, curated vocabulary, and source-annotated visual similarities as separate evidence lanes. A shared reading or shape is not an etymology claim.</p>
          {entry.vocabulary.length ? <div className="mt-3"><h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Study examples</h4><ul className="mt-2 flex flex-wrap gap-2">{entry.vocabulary.map((item) => <li key={`${item.word}-${item.reading}`} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs"><span lang="ja" className="font-japanese text-base font-bold">{item.word}</span> · <span lang="ja">{item.reading}</span><span className="text-slate-600"> — {item.meaning}</span></li>)}</ul></div> : <p className="mt-3 text-xs text-slate-600">No first-party vocabulary examples are listed for this entry.</p>}
          {entry.related.length ? <div className="mt-3"><h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Shared visual annotations</h4><ul className="mt-2 flex flex-wrap gap-2">{entry.related.slice(0, 8).map((item) => <li key={`visual-${item.character}`}><Link href={mindTreeExploreHref(entry.character, item.character, `shared learning relation from ${entry.character}`)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-indigo-50 px-3 text-xs text-indigo-950 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"><span lang="ja" className="font-japanese text-lg font-bold">{item.character}</span><span>{item.meaning} · {item.sharedCount} shared annotation{item.sharedCount === 1 ? "" : "s"}</span></Link></li>)}</ul><p className="mt-1 text-[10px] text-slate-500">Links are based on literal KanjiVG annotations only.</p></div> : null}
          {entry.sameOnReading.length ? <div className="mt-3"><h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Recorded On-reading neighbors</h4><ul className="mt-2 flex flex-wrap gap-2">{entry.sameOnReading.slice(0, 8).map((item) => <li key={`reading-${item.character}`}><Link href={mindTreeExploreHref(entry.character, item.character, `shared On-reading relation from ${entry.character}`)} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-50 px-3 text-xs text-amber-950 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"><span lang="ja" className="font-japanese text-lg font-bold">{item.character}</span><span>{item.meaning} · {item.sharedReadings.join(" / ")}</span></Link></li>)}</ul><p className="mt-1 text-[10px] text-slate-500">A shared recorded reading indicates a learning relation, not historical derivation.</p></div> : null}
          <p className="mt-3 text-[10px] text-slate-500">Neighborhood graph: {entry.learningGraph.nodes.length} nodes, {entry.learningGraph.edges.length} edges; source/evidence lanes remain attached to each relation.</p>
        </div> : null}
      </div>

      {nextStage ? <button type="button" onClick={() => dispatch({ type: "advance-stage" })} className="mt-3 min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-700 focus-visible:ring-offset-2">Continue to {nextStage} →</button> : null}
    </section>
  );
}
