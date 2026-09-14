import "server-only";

import {
  findKanjiRowByLiteral,
  getComponentsForKanji,
  getComponentsForKanjiIds,
  getKanjiUsingComponentLiteral,
  getRadicalsForKanji,
  getVocabularyForKanji,
  listSources,
} from "@/repositories/knowledge";
import type {
  ComponentRef,
  MindTree,
  MindTreeEdge,
  MindTreeNode,
} from "@/types/knowledge";

export interface MindTreeOptions {
  /** How many component levels below the root are traversed (1 = direct parts only) */
  depth?: number;
  /** Maximum vocabulary nodes attached to the root */
  vocabularyLimit?: number;
  /** Maximum derivative kanji nodes (kanji that contain the root as a component) */
  derivativesLimit?: number;
}

const COMPONENT_BRANCH = "component";
const RADICAL_BRANCH = "radical";
const VOCAB_BRANCH = "vocabulary";
const DERIVED_BRANCH = "used-in";

function componentMeta(component: ComponentRef) {
  return {
    kind: component.kind,
    strokes: component.strokeCount,
    usageCount: component.usageCount,
    kanjiId: component.kanjiId,
    readings: [...component.onReadings, ...component.kunReadings].slice(0, 4).join(" / ") || null,
  };
}

/**
 * Builds the Kanji Mind Tree **from the database graph only** — no hand drawn
 * layout data. Nodes and edges are derived from:
 *
 *   kanji_radicals   -> radical branch
 *   kanji_components -> component branch (recursively, via component.kanjiId)
 *   kanji_vocabulary -> vocabulary branch
 *   kanji_components (reverse) -> derived kanji branch
 */
export async function buildMindTree(
  literal: string,
  options: MindTreeOptions = {},
): Promise<MindTree | null> {
  const depth = Math.min(Math.max(options.depth ?? 2, 1), 4);
  const vocabularyLimit = Math.min(Math.max(options.vocabularyLimit ?? 12, 0), 48);
  const derivativesLimit = Math.min(Math.max(options.derivativesLimit ?? 8, 0), 48);

  const root = await findKanjiRowByLiteral(literal);
  if (!root) return null;

  const [radicals, components, vocabulary, derivatives, sources] = await Promise.all([
    getRadicalsForKanji(root.id),
    getComponentsForKanji(root.id),
    getVocabularyForKanji(root.id, vocabularyLimit),
    getKanjiUsingComponentLiteral(literal, derivativesLimit + 1),
    listSources(),
  ]);

  const rootKey = `kanji:${root.id}`;
  const nodes: MindTreeNode[] = [];
  const edges: MindTreeEdge[] = [];

  const push = (node: MindTreeNode, relation: string) => {
    nodes.push(node);
    if (node.parent) edges.push({ from: node.parent, to: node.key, relation });
  };

  push(
    {
      key: rootKey,
      kind: "kanji",
      label: root.literal,
      subLabel: [...root.onReadings.slice(0, 2), ...root.kunReadings.slice(0, 1)].join(" / "),
      meanings: root.meanings,
      depth: 0,
      parent: null,
      relation: "root",
      href: `/kanji/${encodeURIComponent(root.literal)}`,
      meta: {
        strokes: root.strokeCount,
        jlpt: root.jlptLevel ? `N${root.jlptLevel}` : null,
        grade: root.grade,
        frequency: root.frequency,
        radicalNumber: root.radicalNumber,
      },
      expandable: components.length > 0,
    },
    "root",
  );

  /* ------------------------------- radicals ------------------------------- */
  for (const radical of radicals) {
    push(
      {
        key: `${rootKey}>radical:${radical.id}`,
        kind: "radical",
        label: radical.literal,
        subLabel: radical.isKangxi ? `Kangxi #${radical.radicalNumber ?? "?"}` : "decomposition radical",
        meanings: radical.meanings ?? [],
        depth: 1,
        parent: rootKey,
        relation: radical.isPrimary ? "primary-radical" : "radical",
        href: `/kanji/radicals/${radical.id}`,
        meta: {
          strokes: radical.strokeCount,
          radicalNumber: radical.radicalNumber,
          isKangxi: radical.isKangxi ? "yes" : "no",
        },
        expandable: false,
      },
      RADICAL_BRANCH,
    );
  }

  /* ---------------------------- component tree ---------------------------- */
  const componentKeysByKanjiId = new Map<number, string>();

  for (const component of components) {
    const key = `${rootKey}>component:${component.id}`;
    componentKeysByKanjiId.set(component.id, key);
    push(
      {
        key,
        kind: "component",
        label: component.literal,
        subLabel: component.kind === "kanji" ? "kanji component" : "radical variant",
        meanings: component.meanings,
        depth: 1,
        parent: rootKey,
        relation: COMPONENT_BRANCH,
        href: component.kanjiId ? `/kanji/${encodeURIComponent(component.literal)}` : null,
        meta: componentMeta(component),
        expandable: component.kanjiId !== null && depth > 1,
      },
      COMPONENT_BRANCH,
    );
  }

  // Recursive expansion: every component that is itself a kanji entry is
  // decomposed again using kanji_components until `depth` is reached.
  let frontier: Array<{ key: string; kanjiId: number; depth: number }> = components
    .filter((component): component is ComponentRef & { kanjiId: number } => component.kanjiId !== null)
    .map((component) => ({
      key: `${rootKey}>component:${component.id}`,
      kanjiId: component.kanjiId,
      depth: 1,
    }));

  while (frontier.length > 0 && frontier[0].depth < depth) {
    const batch = await getComponentsForKanjiIds(frontier.map((item) => item.kanjiId));
    const nextFrontier: Array<{ key: string; kanjiId: number; depth: number }> = [];

    for (const parent of frontier) {
      for (const child of batch.get(parent.kanjiId) ?? []) {
        const key = `${parent.key}>component:${child.id}`;
        push(
          {
            key,
            kind: "component",
            label: child.literal,
            subLabel: child.kind === "kanji" ? "kanji component" : "radical variant",
            meanings: child.meanings,
            depth: parent.depth + 1,
            parent: parent.key,
            relation: COMPONENT_BRANCH,
            href: child.kanjiId ? `/kanji/${encodeURIComponent(child.literal)}` : null,
            meta: componentMeta(child),
            expandable: child.kanjiId !== null && parent.depth + 1 < depth,
          },
          COMPONENT_BRANCH,
        );
        if (child.kanjiId !== null && parent.depth + 1 < depth) {
          nextFrontier.push({ key, kanjiId: child.kanjiId, depth: parent.depth + 1 });
        }
      }
    }
    frontier = nextFrontier;
  }

  /* ------------------------------ vocabulary ------------------------------ */
  for (const entry of vocabulary) {
    push(
      {
        key: `${rootKey}>vocabulary:${entry.id}`,
        kind: "vocabulary",
        label: entry.kanjiText,
        subLabel: entry.kanaText ?? undefined,
        meanings: entry.meanings.slice(0, 4),
        depth: 1,
        parent: rootKey,
        relation: VOCAB_BRANCH,
        href: `/dictionary?q=${encodeURIComponent(entry.kanjiText)}`,
        meta: {
          partsOfSpeech: entry.partsOfSpeech.slice(0, 3).join(", ") || null,
          priority: entry.priority,
          jmdictId: entry.externalId,
        },
        expandable: false,
      },
      VOCAB_BRANCH,
    );
  }

  /* ------------------------------ derivatives ----------------------------- */
  for (const derived of derivatives.filter((kanji) => kanji.literal !== root.literal).slice(0, derivativesLimit)) {
    push(
      {
        key: `${rootKey}>derived:${derived.id}`,
        kind: "kanji",
        label: derived.literal,
        subLabel: derived.meanings.slice(0, 2).join(", "),
        meanings: derived.meanings,
        depth: 1,
        parent: rootKey,
        relation: DERIVED_BRANCH,
        href: `/kanji/${encodeURIComponent(derived.literal)}`,
        meta: {
          strokes: derived.strokeCount,
          jlpt: derived.jlptLevel ? `N${derived.jlptLevel}` : null,
        },
        expandable: true,
      },
      DERIVED_BRANCH,
    );
  }

  const relevantCodes = ["kanjidic2", "radkfile", "kradfile", "jmdict"];

  return {
    root: root.literal,
    rootKanjiId: root.id,
    depth,
    nodes,
    edges,
    counts: {
      radicals: radicals.length,
      components: nodes.filter((node) => node.kind === "component").length,
      vocabulary: vocabulary.length,
      nodes: nodes.length,
    },
    provenance: sources
      .filter((source) => relevantCodes.includes(source.code))
      .map((source) => ({
        code: source.code,
        name: source.name,
        license: source.license,
        version: source.version,
        sourceUrl: source.sourceUrl,
      })),
  };
}
