import { createHash } from "node:crypto";
import { KANJI, KANJI_SOURCE_REF, ELEMENTS, EXTRA_ELEMENTS } from "@/data/kanji";
import mindtreeSliceJson from "@/data/kanji-mindtree/kanjivg-structure-slice.json";
import {
  KANJIVG_ARCHIVE_SHA256,
  KANJIVG_ATTRIBUTION,
  KANJIVG_LICENSE,
  KANJIVG_SOURCE_REF,
  KANJIVG_SOURCE_VERSION,
  KANJIVG_TRANSFORMATION_VERSION,
  type KanjiVgGlyphRecord,
  type KanjiVgSliceArtifact,
  type KanjiVgSliceRecord,
} from "@/lib/kanji/kanjiVgSvgAdapter";
import {
  getKanjidic2MindTreeFacts,
  KANJIDIC2_MINDTREE_SOURCE_REF,
  validateKanjidic2MindTreeFacts,
  type Kanjidic2MindTreeFact,
} from "@/lib/kanji/kanjidic2MindtreeFacts";
import {
  buildMindTreeLearningGraph,
  type MindTreeLearningGraph,
} from "@/lib/kanji/learningGraph";
import {
  getMnemonicAvailability,
  getPublishedMnemonic,
  MINDTREE_MNEMONIC_RECORDS,
  validateMnemonicRecords,
  type MindTreeMnemonicAvailability,
  type MindTreeMnemonicRecord,
} from "@/lib/kanji/mindtreeMnemonicContent";
import {
  canonicalizeStructuralEvidenceGraph,
  validateStructuralEvidenceGraph,
  type StructuralEvidenceGraph,
} from "@/lib/kanji/structuralEvidenceGraph";

const mindtreeSlice = mindtreeSliceJson as unknown as KanjiVgSliceArtifact;
const kanjidicFactsArtifact = getKanjidic2MindTreeFacts();
const dictionaryFactsByCharacter = new Map(kanjidicFactsArtifact.records.map((fact) => [fact.character, fact]));
const firstPartyByCharacter = new Map(KANJI.map((item) => [item.character, item]));
const elementDefinitions = [...ELEMENTS, ...EXTRA_ELEMENTS];

export const MINDTREE_NEIGHBORHOOD_LIMITS = {
  graphDepth: 2,
  graphNodes: 80,
  relatedCharacters: 10,
  componentFamilyMembers: 10,
} as const;

export type MindTreeMnemonic = MindTreeMnemonicRecord;

export interface MindTreeComponentFamilyMember {
  character: string;
  meaning: string;
  meaningSourceRef: string;
}

export interface MindTreeAnnotation {
  occurrenceId: string;
  sourceGroupId: string;
  parentOccurrenceId: string | null;
  renderedAs: string;
  componentIdentity: string;
  componentCharacter: string | null;
  position: string | null;
  radicalMarker: string | null;
  phoneticMarker: string | null;
  sourcePathCount: number;
  supportedCharacter: boolean;
  familyTotal: number;
  familyMembers: MindTreeComponentFamilyMember[];
  firstPartyElement: { character: string; meaning: string; category: string; sourceRef: string } | null;
}

export interface MindTreeRelatedCharacter {
  character: string;
  meaning: string;
  meaningSourceRef: string;
  sharedAnnotations: string[];
  sharedCount: number;
  relation: "shares-visual-annotation";
  explanation: string;
}

export interface MindTreeReadingRelation {
  character: string;
  meaning: string;
  meaningSourceRef: string;
  sharedReadings: string[];
  relation: "shares-recorded-on-reading";
  explanation: string;
}

export interface MindTreeDictionaryFacts extends Kanjidic2MindTreeFact {
  sourceRef: typeof KANJIDIC2_MINDTREE_SOURCE_REF;
  license: "CC-BY-SA-4.0";
}

export interface MindTreeEntry {
  character: string;
  meaning: string;
  meaningSourceRef: string;
  readingsKun: string[];
  readingsOn: string[];
  readingSourceRef: string;
  strokeCount: number;
  strokeCountSourceRef: string;
  jlptLevel: string | null;
  gradeLevel: number | null;
  primaryRadical: { character: string; meaning: string } | null;
  mnemonic: MindTreeMnemonic | null;
  mnemonicAvailability: MindTreeMnemonicAvailability;
  vocabulary: Array<{ word: string; reading: string; meaning: string }>;
  firstPartySourceRef: typeof KANJI_SOURCE_REF | null;
  dictionaryFacts: MindTreeDictionaryFacts;
  evidence: KanjiVgSliceRecord;
  annotations: MindTreeAnnotation[];
  related: MindTreeRelatedCharacter[];
  sameOnReading: MindTreeReadingRelation[];
  learningGraph: MindTreeLearningGraph;
}

export interface MindTreeCatalogItem {
  character: string;
  meaning: string;
  readingsKun: string[];
  readingsOn: string[];
  jlptLevel: string | null;
  gradeLevel: number | null;
  strokeCount: number;
  meaningSourceRef: string;
  hasFirstPartyMnemonic: boolean;
}

function compareCharacters(left: string, right: string): number {
  return (left.codePointAt(0) ?? 0) - (right.codePointAt(0) ?? 0);
}

function sourceRecordMetadataValid(): boolean {
  return Boolean(
    mindtreeSlice
      && mindtreeSlice.artifactVersion === "nihongobridge-kanjivg-slice@1"
      && mindtreeSlice.source.sourceRef === KANJIVG_SOURCE_REF
      && mindtreeSlice.source.sourceVersion === KANJIVG_SOURCE_VERSION
      && mindtreeSlice.source.archiveSha256 === KANJIVG_ARCHIVE_SHA256
      && mindtreeSlice.source.license === KANJIVG_LICENSE
      && mindtreeSlice.source.attribution === KANJIVG_ATTRIBUTION
      && mindtreeSlice.transformationVersion === KANJIVG_TRANSFORMATION_VERSION,
  );
}

function validatedGraph(record: KanjiVgSliceRecord): StructuralEvidenceGraph | null {
  const expected = {
    sourceRef: KANJIVG_SOURCE_REF,
    sourceVersion: KANJIVG_SOURCE_VERSION,
    declaredContentDigest: record.sourceFileSha256,
    transformationVersion: KANJIVG_TRANSFORMATION_VERSION,
    license: KANJIVG_LICENSE,
    attribution: KANJIVG_ATTRIBUTION,
  };
  const validation = validateStructuralEvidenceGraph(record.graph, expected);
  if (!validation.valid) return null;
  if (record.graph.provenance.declaredContentDigest !== record.sourceFileSha256) return null;
  if (!/^[0-9a-f]{64}$/.test(record.sourceFileSha256)) return null;
  const canonical = canonicalizeStructuralEvidenceGraph(record.graph, expected);
  const actualGraphDigest = createHash("sha256").update(canonical, "utf8").digest("hex");
  if (record.graphCanonicalSha256 !== actualGraphDigest) return null;
  return record.graph;
}

const validSourceRecords = new Map<string, { record: KanjiVgSliceRecord; graph: StructuralEvidenceGraph }>();
if (sourceRecordMetadataValid() && Array.isArray(mindtreeSlice.records)) {
  for (const record of mindtreeSlice.records) {
    const graph = validatedGraph(record);
    if (graph && !validSourceRecords.has(record.character)) validSourceRecords.set(record.character, { record, graph });
  }
}

const componentReverseIndex = new Map<string, Set<string>>();
for (const [character, value] of validSourceRecords) {
  for (const node of value.graph.nodes) {
    if (node.kind !== "component") continue;
    const members = componentReverseIndex.get(node.identity) ?? new Set<string>();
    members.add(character);
    componentReverseIndex.set(node.identity, members);
  }
}

const onReadingReverseIndex = new Map<string, Set<string>>();
for (const fact of kanjidicFactsArtifact.records) {
  for (const reading of new Set(fact.readingsOn)) {
    const members = onReadingReverseIndex.get(reading) ?? new Set<string>();
    members.add(fact.character);
    onReadingReverseIndex.set(reading, members);
  }
}

function primaryRadicalFor(id: string | null | undefined): { character: string; meaning: string } | null {
  if (!id) return null;
  const definition = elementDefinitions.find((element) => element.id === id);
  return definition ? { character: definition.character, meaning: definition.meaning } : null;
}

function firstPartyElementFor(character: string | null): MindTreeAnnotation["firstPartyElement"] {
  if (!character) return null;
  const element = elementDefinitions.find(
    (candidate) => candidate.character === character || candidate.altForms.includes(character),
  );
  return element
    ? { character: element.character, meaning: element.meaning, category: element.category, sourceRef: KANJI_SOURCE_REF }
    : null;
}

function meaningFor(character: string): { meaning: string; sourceRef: string } | null {
  const firstParty = firstPartyByCharacter.get(character);
  if (firstParty) return { meaning: firstParty.meaning, sourceRef: KANJI_SOURCE_REF };
  const facts = dictionaryFactsByCharacter.get(character);
  return facts ? { meaning: facts.meaningsEnglish.slice(0, 3).join(", "), sourceRef: KANJIDIC2_MINDTREE_SOURCE_REF } : null;
}

function identityLabel(graph: StructuralEvidenceGraph, identity: string): string {
  const node = graph.nodes.find((candidate) => candidate.kind === "component" && candidate.identity === identity);
  return node?.kind === "component" ? node.character ?? identity : identity;
}

function annotationsFor(record: KanjiVgGlyphRecord, character: string): MindTreeAnnotation[] {
  const occurrences = record.graph.nodes.filter((node) => node.kind === "occurrence");
  const componentById = new Map(
    record.graph.nodes
      .filter((node) => node.kind === "component")
      .map((node) => [node.id, node]),
  );
  const groupByOccurrence = new Map(
    record.groups
      .filter((group) => group.occurrenceId)
      .map((group) => [group.occurrenceId!, group]),
  );
  return occurrences.flatMap((occurrence) => {
    if (occurrence.kind !== "occurrence") return [];
    const component = componentById.get(occurrence.componentId);
    const group = groupByOccurrence.get(occurrence.id);
    if (!component || component.kind !== "component" || !group) return [];
    const familyCharacters = [...(componentReverseIndex.get(component.identity) ?? [])]
      .filter((candidate) => candidate !== character)
      .sort(compareCharacters);
    const familyMembers = familyCharacters
      .slice(0, MINDTREE_NEIGHBORHOOD_LIMITS.componentFamilyMembers)
      .flatMap((candidate) => {
        const meaning = meaningFor(candidate);
        return meaning ? [{ character: candidate, meaning: meaning.meaning, meaningSourceRef: meaning.sourceRef }] : [];
      });
    return [{
      occurrenceId: occurrence.id,
      sourceGroupId: group.sourceGroupId,
      parentOccurrenceId: group.parentOccurrenceId,
      renderedAs: occurrence.renderedAs,
      componentIdentity: component.identity,
      componentCharacter: component.character,
      position: group.position,
      radicalMarker: group.radicalMarker,
      phoneticMarker: group.phoneticMarker,
      sourcePathCount: record.paths.filter((path) => path.componentOccurrenceId === occurrence.id).length,
      supportedCharacter: component.character !== null && validSourceRecords.has(component.character),
      familyTotal: familyCharacters.length,
      familyMembers,
      firstPartyElement: firstPartyElementFor(component.character),
    }];
  }).sort((left, right) => {
    const leftOccurrence = occurrences.find((item) => item.kind === "occurrence" && item.id === left.occurrenceId);
    const rightOccurrence = occurrences.find((item) => item.kind === "occurrence" && item.id === right.occurrenceId);
    return (leftOccurrence?.kind === "occurrence" ? leftOccurrence.orderIndex : 0)
      - (rightOccurrence?.kind === "occurrence" ? rightOccurrence.orderIndex : 0);
  });
}

function relatedCharacterRows(character: string, graph: StructuralEvidenceGraph): MindTreeRelatedCharacter[] {
  const targetIdentities = new Set(
    graph.nodes.filter((node) => node.kind === "component").map((node) => node.identity),
  );
  const candidates = new Set<string>();
  for (const identity of targetIdentities) {
    for (const candidate of componentReverseIndex.get(identity) ?? []) {
      if (candidate !== character) candidates.add(candidate);
    }
  }
  return [...candidates].flatMap((candidate) => {
    const candidateGraph = validSourceRecords.get(candidate)?.graph;
    const candidateMeaning = meaningFor(candidate);
    if (!candidateGraph || !candidateMeaning) return [];
    const sharedAnnotations = [...new Set(
      candidateGraph.nodes
        .filter((node) => node.kind === "component" && targetIdentities.has(node.identity))
        .map((node) => node.kind === "component" ? node.character ?? node.identity : ""),
    )].sort(compareCharacters);
    if (sharedAnnotations.length === 0) return [];
    return [{
      character: candidate,
      meaning: candidateMeaning.meaning,
      meaningSourceRef: candidateMeaning.sourceRef,
      sharedAnnotations,
      sharedCount: sharedAnnotations.length,
      relation: "shares-visual-annotation" as const,
      explanation: `Shares exact KanjiVG component annotation ${sharedAnnotations.join(", ")} in this bounded slice; this does not imply a shared meaning, origin, or phonetic role.`,
    }];
  }).sort((left, right) => right.sharedCount - left.sharedCount || compareCharacters(left.character, right.character))
    .slice(0, MINDTREE_NEIGHBORHOOD_LIMITS.relatedCharacters);
}

function sameOnReadingRows(character: string, facts: Kanjidic2MindTreeFact): MindTreeReadingRelation[] {
  const candidates = new Map<string, Set<string>>();
  for (const reading of new Set(facts.readingsOn)) {
    for (const candidate of onReadingReverseIndex.get(reading) ?? []) {
      if (candidate === character) continue;
      const shared = candidates.get(candidate) ?? new Set<string>();
      shared.add(reading);
      candidates.set(candidate, shared);
    }
  }
  return [...candidates].flatMap(([candidate, shared]) => {
    const meaning = meaningFor(candidate);
    if (!meaning) return [];
    const sharedReadings = [...shared].sort();
    return [{
      character: candidate,
      meaning: meaning.meaning,
      meaningSourceRef: meaning.sourceRef,
      sharedReadings,
      relation: "shares-recorded-on-reading" as const,
      explanation: `Shares exact recorded On-reading ${sharedReadings.join(", ")} in KANJIDIC2; this is a pronunciation overlap, not a claim of semantic or historical relationship.`,
    }];
  }).sort((left, right) => right.sharedReadings.length - left.sharedReadings.length || compareCharacters(left.character, right.character))
    .slice(0, MINDTREE_NEIGHBORHOOD_LIMITS.relatedCharacters);
}

function selectedMeaningAndReadings(fact: Kanjidic2MindTreeFact) {
  const firstParty = firstPartyByCharacter.get(fact.character);
  return {
    meaning: firstParty?.meaning ?? fact.meaningsEnglish.slice(0, 3).join(", "),
    meaningSourceRef: firstParty ? KANJI_SOURCE_REF : KANJIDIC2_MINDTREE_SOURCE_REF,
    readingsKun: firstParty?.readingsKun ?? fact.readingsKun,
    readingsOn: firstParty?.readingsOn ?? fact.readingsOn,
    readingSourceRef: firstParty ? KANJI_SOURCE_REF : KANJIDIC2_MINDTREE_SOURCE_REF,
    strokeCount: firstParty?.strokeCount ?? fact.strokeCount,
    strokeCountSourceRef: firstParty ? KANJI_SOURCE_REF : KANJIDIC2_MINDTREE_SOURCE_REF,
    jlptLevel: firstParty?.jlptLevel ?? null,
    gradeLevel: firstParty?.gradeLevel ?? fact.gradeLevel,
  };
}

export function listMindTreeCatalog(): MindTreeCatalogItem[] {
  if (!validateKanjidic2MindTreeFacts().valid) return [];
  return kanjidicFactsArtifact.records.flatMap((fact) => {
    const source = validSourceRecords.get(fact.character);
    if (!source) return [];
    const display = selectedMeaningAndReadings(fact);
    return [{
      character: fact.character,
      ...display,
      hasFirstPartyMnemonic: Boolean(firstPartyByCharacter.get(fact.character)?.mnemonic),
    }];
  }).sort((left, right) => compareCharacters(left.character, right.character));
}

export interface MindTreeEditorialContext {
  character: string;
  meaning: string;
  meaningSourceRef: string;
  dictionaryMeanings: string[];
  readingsKun: string[];
  readingsOn: string[];
  gradeLevel: number | null;
  strokeCount: number;
  annotations: Array<{ label: string; position: string | null; radicalMarker: string | null; phoneticMarker: string | null }>;
  visualSourceFile: string;
  visualSourceSha256: string;
  visualSourceRef: string;
  visualSourceVersion: string;
  visualLicense: string;
  dictionarySourceRef: string;
  hasFirstPartyStudyRecord: boolean;
  firstPartyVocabularyCount: number;
}

/** Compact editor context only: no SVG paths and no composed learning graph. */
export function listMindTreeEditorialContext(): MindTreeEditorialContext[] {
  if (!validateKanjidic2MindTreeFacts().valid || !sourceRecordMetadataValid()) return [];
  return kanjidicFactsArtifact.records.flatMap((fact) => {
    const source = validSourceRecords.get(fact.character);
    if (!source) return [];
    const display = selectedMeaningAndReadings(fact);
    const seen = new Set<string>();
    const annotations = source.record.groups.flatMap((group) => {
      if (!group.element || group.element === fact.character || seen.has(`${group.element}:${group.position ?? ""}`)) return [];
      seen.add(`${group.element}:${group.position ?? ""}`);
      return [{ label: group.element, position: group.position, radicalMarker: group.radicalMarker, phoneticMarker: group.phoneticMarker }];
    });
    return [{
      character: fact.character,
      meaning: display.meaning,
      meaningSourceRef: display.meaningSourceRef,
      dictionaryMeanings: fact.meaningsEnglish,
      readingsKun: fact.readingsKun,
      readingsOn: fact.readingsOn,
      gradeLevel: fact.gradeLevel,
      strokeCount: fact.strokeCount,
      annotations,
      visualSourceFile: source.record.sourceFile,
      visualSourceSha256: source.record.sourceFileSha256,
      visualSourceRef: KANJIVG_SOURCE_REF,
      visualSourceVersion: KANJIVG_SOURCE_VERSION,
      visualLicense: KANJIVG_LICENSE,
      dictionarySourceRef: KANJIDIC2_MINDTREE_SOURCE_REF,
      hasFirstPartyStudyRecord: firstPartyByCharacter.has(fact.character),
      firstPartyVocabularyCount: firstPartyByCharacter.get(fact.character)?.vocabulary.length ?? 0,
    }];
  }).sort((left, right) => compareCharacters(left.character, right.character));
}

export interface MindTreeEditorialVisualPreview {
  character: string;
  viewBox: string;
  sourceStrokeWidth: number;
  sourceRef: string;
  sourceVersion: string;
  license: string;
  sourceFile: string;
  sourceFileSha256: string;
  annotations: Array<{ occurrenceId: string; label: string; position: string | null; radicalMarker: string | null; phoneticMarker: string | null }>;
  paths: Array<{ sourcePathId: string; pathData: string; componentOccurrenceId: string | null }>;
}

/** One-glyph, source-only visual payload for the dev studio; never a global graph. */
export function getMindTreeEditorialVisualPreview(character: string): MindTreeEditorialVisualPreview | null {
  if (Array.from(character).length !== 1 || !sourceRecordMetadataValid()) return null;
  const source = validSourceRecords.get(character);
  if (!source) return null;
  return {
    character,
    viewBox: source.record.viewBox,
    sourceStrokeWidth: source.record.sourceStrokeWidth,
    sourceRef: KANJIVG_SOURCE_REF,
    sourceVersion: KANJIVG_SOURCE_VERSION,
    license: KANJIVG_LICENSE,
    sourceFile: source.record.sourceFile,
    sourceFileSha256: source.record.sourceFileSha256,
    annotations: source.record.groups.flatMap((group) => group.element && group.element !== character && group.occurrenceId ? [{ occurrenceId: group.occurrenceId, label: group.element, position: group.position, radicalMarker: group.radicalMarker, phoneticMarker: group.phoneticMarker }] : []),
    paths: source.record.paths.map((path) => ({ sourcePathId: path.sourcePathId, pathData: path.pathData, componentOccurrenceId: path.componentOccurrenceId })),
  };
}

function validateAllMnemonicRecords() {
  const visualAnnotations = new Map([...validSourceRecords.entries()].map(([character, value]) => [
    character,
    new Set(value.record.groups.flatMap((group) => group.element && group.element !== character ? [group.element] : [])),
  ]));
  return validateMnemonicRecords(
    MINDTREE_MNEMONIC_RECORDS,
    new Set(kanjidicFactsArtifact.records.map((fact) => fact.character)),
    visualAnnotations,
  );
}

export function getMindTreeEntry(character: string): MindTreeEntry | null {
  if (Array.from(character).length !== 1 || !validateKanjidic2MindTreeFacts().valid) return null;
  const facts = dictionaryFactsByCharacter.get(character);
  const source = validSourceRecords.get(character);
  if (!facts || !source) return null;
  const firstParty = firstPartyByCharacter.get(character);
  const display = selectedMeaningAndReadings(facts);
  const annotations = annotationsFor(source.record, character);
  const related = relatedCharacterRows(character, source.graph);
  const sameOnReading = sameOnReadingRows(character, facts);
  const vocabulary = firstParty?.vocabulary ?? [];
  const mnemonicValidation = validateAllMnemonicRecords();
  const mnemonic = mnemonicValidation.valid ? getPublishedMnemonic(character) : null;
  const mnemonicAvailability = getMnemonicAvailability(character);
  const dictionaryFacts: MindTreeDictionaryFacts = {
    ...facts,
    sourceRef: KANJIDIC2_MINDTREE_SOURCE_REF,
    license: "CC-BY-SA-4.0",
  };
  const learningGraph = buildMindTreeLearningGraph({
    character,
    meaning: display.meaning,
    meaningSourceRef: display.meaningSourceRef,
    annotations: annotations.map((annotation) => ({
      componentIdentity: annotation.componentIdentity,
      renderedAs: annotation.renderedAs,
      occurrenceCount: source.graph.nodes.filter((node) => node.kind === "occurrence" && node.componentId === source.graph.nodes.find((component) => component.kind === "component" && component.identity === annotation.componentIdentity)?.id).length,
      familyCharacters: annotation.familyMembers,
    })),
    onReadings: facts.readingsOn,
    kunReadings: facts.readingsKun,
    relatedOnReadings: sameOnReading,
    vocabulary,
    sources: {
      kanjivg: KANJIVG_SOURCE_REF,
      derivedIndex: "derived:nihongobridge:kanji-component-family-index@1",
      kanjidic2: KANJIDIC2_MINDTREE_SOURCE_REF,
      firstParty: KANJI_SOURCE_REF,
    },
  });
  return {
    character,
    ...display,
    primaryRadical: primaryRadicalFor(firstParty?.primaryRadicalId),
    mnemonic,
    mnemonicAvailability,
    vocabulary,
    firstPartySourceRef: firstParty ? KANJI_SOURCE_REF : null,
    dictionaryFacts,
    evidence: source.record,
    annotations,
    related,
    sameOnReading,
    learningGraph,
  };
}

export function validateMindTreeSlice(): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const dictionaryValidation = validateKanjidic2MindTreeFacts();
  if (!dictionaryValidation.valid) issues.push(...dictionaryValidation.issues);
  const mnemonicValidation = validateAllMnemonicRecords();
  if (!mnemonicValidation.valid) issues.push(...mnemonicValidation.issues.map((issue) => `mnemonic: ${issue}`));
  if (!sourceRecordMetadataValid()) issues.push("KanjiVG source or transformation pin mismatch");
  if (!Array.isArray(mindtreeSlice.records)) return { valid: false, issues: [...issues, "source-slice records are not an array"] };
  if (mindtreeSlice.records.length !== 100) issues.push("KanjiVG slice must contain exactly 100 records");
  if (mindtreeSlice.records.length !== kanjidicFactsArtifact.records.length) issues.push("KanjiVG and KANJIDIC2 slices have different record counts");
  const chars = new Set<string>();
  for (const record of mindtreeSlice.records) {
    if (chars.has(record.character)) issues.push(`duplicate source record: ${record.character}`);
    chars.add(record.character);
    const expectedSourceFile = `kanji/${(record.character.codePointAt(0) ?? 0).toString(16).padStart(5, "0")}.svg`;
    if (record.sourceFile !== expectedSourceFile) issues.push(`source filename/glyph mismatch: ${record.character}`);
    const glyphNodes = record.graph.nodes.filter((node) => node.kind === "glyph");
    if (glyphNodes.length !== 1 || glyphNodes[0]?.character !== record.character) issues.push(`graph glyph identity mismatch: ${record.character}`);
    const rootGroup = record.groups.find((group) => group.sourceGroupId === record.rootGroupId);
    if (!rootGroup || rootGroup.element !== record.character) issues.push(`source root group mismatch: ${record.character}`);
    const pathIds = record.paths.map((path) => path.sourcePathId);
    if (new Set(pathIds).size !== pathIds.length) issues.push(`duplicate source path id: ${record.character}`);
    if (!dictionaryFactsByCharacter.has(record.character)) issues.push(`source record has no KANJIDIC2 facts: ${record.character}`);
    if (!record.sourceFileSha256 || !/^[0-9a-f]{64}$/.test(record.sourceFileSha256)) issues.push(`invalid source file hash: ${record.character}`);
    if (!record.graphCanonicalSha256 || !/^[0-9a-f]{64}$/.test(record.graphCanonicalSha256)) issues.push(`invalid graph hash: ${record.character}`);
    if (!validatedGraph(record)) issues.push(`invalid structural graph: ${record.character}`);
    if (record.paths.length === 0) issues.push(`missing source paths: ${record.character}`);
    if (record.paths.some((path) => !path.sourcePathId || !path.pathData)) issues.push(`invalid source path: ${record.character}`);
    if (record.paths.some((path) => path.componentOccurrenceId && !record.graph.nodes.some((node) => node.kind === "occurrence" && node.id === path.componentOccurrenceId))) {
      issues.push(`dangling path-to-component reference: ${record.character}`);
    }
  }
  for (const fact of kanjidicFactsArtifact.records) if (!chars.has(fact.character)) issues.push(`missing KanjiVG source record: ${fact.character}`);
  for (const item of KANJI) if (!chars.has(item.character)) issues.push(`missing first-party seed character: ${item.character}`);
  return { valid: issues.length === 0, issues };
}
