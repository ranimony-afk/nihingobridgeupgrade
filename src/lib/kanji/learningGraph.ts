export type MindTreeGraphEvidenceLane = "kanjivg-source-markup" | "derived-component-index" | "kanjidic2-dictionary-fact" | "first-party-study-example";

export type MindTreeGraphNode =
  | { id: string; kind: "kanji"; character: string; label: string; meaning: string; meaningSourceRef: string }
  | { id: string; kind: "component"; label: string; identity: string; occurrenceCount: number }
  | { id: string; kind: "reading"; label: string; readingType: "on" | "kun" }
  | { id: string; kind: "vocabulary"; label: string; reading: string; meaning: string };

export type MindTreeGraphRelation =
  | "has-visual-annotation"
  | "shares-visual-annotation"
  | "has-recorded-reading"
  | "shares-recorded-on-reading"
  | "has-first-party-example";

export interface MindTreeGraphEdge {
  id: string;
  from: string;
  to: string;
  relation: MindTreeGraphRelation;
  label: string;
  explanation: string;
  evidenceLane: MindTreeGraphEvidenceLane;
  sourceRef: string;
}

export interface MindTreeLearningGraph {
  graphVersion: "nihongobridge-learning-neighborhood@1";
  rootId: string;
  maxDepth: 2;
  maxNodes: number;
  nodes: MindTreeGraphNode[];
  edges: MindTreeGraphEdge[];
}

export const MINDTREE_LEARNING_GRAPH_LIMITS = {
  maxNodes: 80,
  maxEdges: 96,
  maxComponents: 12,
  maxFamilyCharactersPerComponent: 10,
  maxRelatedCharactersByReading: 5,
  maxReadings: 8,
  maxVocabulary: 4,
} as const;

export function buildMindTreeLearningGraph(input: {
  character: string;
  meaning: string;
  meaningSourceRef: string;
  annotations: Array<{
    componentIdentity: string;
    renderedAs: string;
    occurrenceCount: number;
    familyCharacters: Array<{ character: string; meaning: string; meaningSourceRef: string }>;
  }>;
  onReadings: string[];
  kunReadings: string[];
  relatedOnReadings: Array<{ character: string; meaning: string; meaningSourceRef: string; sharedReadings: string[] }>;
  vocabulary: Array<{ word: string; reading: string; meaning: string }>;
  sources: {
    kanjivg: string;
    derivedIndex: string;
    kanjidic2: string;
    firstParty: string;
  };
}): MindTreeLearningGraph {
  const rootId = `kanji:${input.character}`;
  const nodes: MindTreeGraphNode[] = [{
    id: rootId,
    kind: "kanji",
    character: input.character,
    label: input.character,
    meaning: input.meaning,
    meaningSourceRef: input.meaningSourceRef,
  }];
  const edges: MindTreeGraphEdge[] = [];
  const nodeIds = new Set([rootId]);
  const edgeIds = new Set<string>();

  const addNode = (node: MindTreeGraphNode): boolean => {
    if (nodeIds.has(node.id)) return true;
    if (nodes.length >= MINDTREE_LEARNING_GRAPH_LIMITS.maxNodes) return false;
    nodeIds.add(node.id);
    nodes.push(node);
    return true;
  };
  const addEdge = (edge: Omit<MindTreeGraphEdge, "id">): void => {
    if (edges.length >= MINDTREE_LEARNING_GRAPH_LIMITS.maxEdges) return;
    const id = `${edge.relation}:${edge.from}->${edge.to}:${edge.label}`;
    if (edgeIds.has(id) || !nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return;
    edgeIds.add(id);
    edges.push({ ...edge, id });
  };

  const uniqueComponents = new Map<string, { label: string; occurrenceCount: number; familyCharacters: Array<{ character: string; meaning: string; meaningSourceRef: string }> }>();
  for (const annotation of input.annotations) {
    const current = uniqueComponents.get(annotation.componentIdentity);
    if (current) {
      current.occurrenceCount += 1;
      continue;
    }
    if (uniqueComponents.size >= MINDTREE_LEARNING_GRAPH_LIMITS.maxComponents) continue;
    uniqueComponents.set(annotation.componentIdentity, {
      label: annotation.renderedAs,
      occurrenceCount: annotation.occurrenceCount,
      familyCharacters: annotation.familyCharacters.slice(0, MINDTREE_LEARNING_GRAPH_LIMITS.maxFamilyCharactersPerComponent),
    });
  }

  for (const [identity, component] of uniqueComponents) {
    const componentId = `component:${identity}`;
    if (!addNode({ id: componentId, kind: "component", label: component.label, identity, occurrenceCount: component.occurrenceCount })) continue;
    addEdge({
      from: rootId,
      to: componentId,
      relation: "has-visual-annotation",
      label: component.label,
      explanation: `KanjiVG marks ${component.label} as a literal visual group annotation in this glyph. It is source markup, not a semantic or historical claim.`,
      evidenceLane: "kanjivg-source-markup",
      sourceRef: input.sources.kanjivg,
    });
    for (const family of component.familyCharacters.slice(0, MINDTREE_LEARNING_GRAPH_LIMITS.maxFamilyCharactersPerComponent)) {
      const familyId = `kanji:${family.character}`;
      if (!addNode({ id: familyId, kind: "kanji", character: family.character, label: family.character, meaning: family.meaning, meaningSourceRef: family.meaningSourceRef })) continue;
      addEdge({
        from: componentId,
        to: familyId,
        relation: "shares-visual-annotation",
        label: component.label,
        explanation: `${family.character} has the same literal KanjiVG component identity in the bounded slice. This indicates annotation overlap only; it does not assert a shared meaning, origin, or phonetic role.`,
        evidenceLane: "derived-component-index",
        sourceRef: input.sources.derivedIndex,
      });
    }
  }

  const readings = [
    ...input.onReadings.map((reading) => ({ reading, readingType: "on" as const })),
    ...input.kunReadings.map((reading) => ({ reading, readingType: "kun" as const })),
  ];
  const readingKeys = new Set<string>();
  for (const item of readings) {
    const key = `${item.readingType}:${item.reading}`;
    if (readingKeys.has(key) || readingKeys.size >= MINDTREE_LEARNING_GRAPH_LIMITS.maxReadings) continue;
    readingKeys.add(key);
    const readingId = `reading:${key}`;
    if (!addNode({ id: readingId, kind: "reading", label: item.reading, readingType: item.readingType })) continue;
    addEdge({
      from: rootId,
      to: readingId,
      relation: "has-recorded-reading",
      label: item.readingType === "on" ? "On reading" : "Kun reading",
      explanation: `KANJIDIC2 records ${item.reading} as a ${item.readingType} reading for ${input.character}.`,
      evidenceLane: "kanjidic2-dictionary-fact",
      sourceRef: input.sources.kanjidic2,
    });
  }

  for (const related of input.relatedOnReadings.slice(0, MINDTREE_LEARNING_GRAPH_LIMITS.maxRelatedCharactersByReading)) {
    const relatedId = `kanji:${related.character}`;
    if (!addNode({ id: relatedId, kind: "kanji", character: related.character, label: related.character, meaning: related.meaning, meaningSourceRef: related.meaningSourceRef })) continue;
    addEdge({
      from: rootId,
      to: relatedId,
      relation: "shares-recorded-on-reading",
      label: related.sharedReadings.join(" · "),
      explanation: `${input.character} and ${related.character} have an exact On-reading string in common in KANJIDIC2. This can indicate a pronunciation overlap; it does not establish semantic, etymological, or historical kinship.`,
      evidenceLane: "kanjidic2-dictionary-fact",
      sourceRef: input.sources.kanjidic2,
    });
  }

  for (const example of input.vocabulary.slice(0, MINDTREE_LEARNING_GRAPH_LIMITS.maxVocabulary)) {
    const vocabularyId = `vocabulary:${example.word}:${example.reading}`;
    if (!addNode({ id: vocabularyId, kind: "vocabulary", label: example.word, reading: example.reading, meaning: example.meaning })) continue;
    addEdge({
      from: rootId,
      to: vocabularyId,
      relation: "has-first-party-example",
      label: example.word,
      explanation: "NihongoBridge first-party study example; not copied from JMdict and not presented as a dictionary-verified entry.",
      evidenceLane: "first-party-study-example",
      sourceRef: input.sources.firstParty,
    });
  }

  return {
    graphVersion: "nihongobridge-learning-neighborhood@1",
    rootId,
    maxDepth: 2,
    maxNodes: MINDTREE_LEARNING_GRAPH_LIMITS.maxNodes,
    nodes,
    edges,
  };
}
