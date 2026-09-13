/**
 * Canonical Kanji Mind Tree domain service (Phase 06.4).
 *
 * Route handlers call this service; it composes repository records into the
 * stable MindTreeResponse contract. It contains no Drizzle imports and never
 * touches the DB. Every node/edge is projected from repository rows: the tree
 * is the database graph, rendered — never hand-drawn.
 */

import { MindTreeRepository } from "@/repositories/MindTreeRepository";
import type {
  MindTreeEdge,
  MindTreeNode,
  MindTreeRelated,
  MindTreeResponse,
} from "@/types/mind-tree";

const VOCABULARY_LIMIT = 6;
const RELATED_BY_RADICAL_LIMIT = 4;
const RELATED_BY_COMPONENT_LIMIT = 4;
const MAX_MEANINGS = 3;

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export class MindTreeService {
  constructor(private readonly repository = new MindTreeRepository()) {}

  async getByLiteral(literal: string): Promise<MindTreeResponse | null> {
    const core = await this.repository.findKanjiCore(literal);
    if (!core) return null;

    const [readingRows, meaningMap, components, vocabRows, vocabTotal, importRun] =
      await Promise.all([
        this.repository.findReadings(core.id),
        this.repository.findMeanings([core.id]),
        this.repository.findComponents(core.id),
        this.repository.findVocabulary(literal, VOCABULARY_LIMIT),
        this.repository.countVocabulary(literal),
        core.importRunId === null
          ? Promise.resolve(null)
          : this.repository.findImportRun(core.importRunId),
      ]);

    const radical =
      core.radicalClassical === null
        ? null
        : await this.repository.findRadicalByNumber(core.radicalClassical);

    const [byRadical, byComponent] = await Promise.all([
      core.radicalClassical === null
        ? Promise.resolve([])
        : this.repository.findRelatedByRadical(
            core.radicalClassical,
            core.id,
            RELATED_BY_RADICAL_LIMIT,
          ),
      this.repository.findRelatedByComponents(core.id, RELATED_BY_COMPONENT_LIMIT),
    ]);

    // Meanings for every related kanji, batched in one query.
    const relatedIds = [...byRadical.map((r) => r.id), ...byComponent.map((r) => r.id)];
    const relatedMeanings = await this.repository.findMeanings(relatedIds);

    const related: MindTreeRelated[] = [
      ...byRadical.map((row): MindTreeRelated => ({
        literal: row.literal,
        meanings: (relatedMeanings.get(row.id) ?? []).slice(0, MAX_MEANINGS),
        strokeCount: row.strokeCount,
        grade: row.grade,
        relation: "same-radical",
        sharedComponents: [],
        sharedCount: 0,
      })),
      ...byComponent
        // A kanji already linked by radical is not duplicated as component kin.
        .filter((row) => !byRadical.some((other) => other.id === row.id))
        .map((row): MindTreeRelated => ({
          literal: row.literal,
          meanings: (relatedMeanings.get(row.id) ?? []).slice(0, MAX_MEANINGS),
          strokeCount: row.strokeCount,
          grade: row.grade,
          relation: "shared-component",
          sharedComponents: row.sharedComponents,
          sharedCount: row.sharedCount,
        })),
    ];

    const glosses = await this.repository.findFirstGlosses(
      vocabRows.map((row) => row.id),
    );

    const onReadings = readingRows
      .filter((row) => row.type === "ja_on")
      .map((row) => row.value);
    const kunReadings = readingRows
      .filter((row) => row.type === "ja_kun")
      .map((row) => row.value);
    const meanings = (meaningMap.get(core.id) ?? []).slice(0, MAX_MEANINGS);

    const centerId = `kanji:${core.literal}`;
    const nodes: MindTreeNode[] = [
      {
        id: centerId,
        type: "kanji",
        label: core.literal,
        sublabel: meanings[0] ?? "",
        href: `/kanji/${encodeURIComponent(core.literal)}`,
        branch: "center",
      },
    ];
    const edges: MindTreeEdge[] = [];

    if (radical) {
      const radicalId = `radical:${radical.number}`;
      nodes.push({
        id: radicalId,
        type: "radical",
        label: radical.character,
        sublabel: `#${radical.number} ${radical.meaning}`,
        href: `/radicals/${radical.number}`,
        branch: "radical",
      });
      edges.push({
        from: centerId,
        to: radicalId,
        label: "classified under",
        kind: "classified-under",
      });
    }

    for (const component of components) {
      const componentId = `component:${component.component}`;
      nodes.push({
        id: componentId,
        type: "component",
        label: component.component,
        sublabel:
          component.radicalNumber !== null
            ? `#${component.radicalNumber} ${component.radicalMeaning ?? ""}`.trim()
            : "component",
        href:
          component.radicalNumber !== null
            ? `/radicals/${component.radicalNumber}`
            : `/kanji?component=${encodeURIComponent(component.component)}`,
        branch: "components",
      });
      edges.push({
        from: centerId,
        to: componentId,
        label: "built from",
        kind: "built-from",
      });
    }

    for (const vocab of vocabRows) {
      const vocabId = `vocab:${vocab.id}`;
      nodes.push({
        id: vocabId,
        type: "vocabulary",
        label: vocab.headword.length <= 4 ? vocab.headword : vocab.headword.slice(0, 4),
        sublabel: glosses.get(vocab.id) ?? vocab.primaryReading,
        href: `/dictionary/${vocab.id}`,
        branch: "vocabulary",
      });
      edges.push({ from: centerId, to: vocabId, label: "used in", kind: "used-in" });
    }

    for (const item of related) {
      const relatedId = `related:${item.literal}`;
      nodes.push({
        id: relatedId,
        type: "related",
        label: item.literal,
        sublabel:
          item.relation === "same-radical"
            ? `radical #${core.radicalClassical}`
            : `shares ${item.sharedComponents.join("·")}`,
        href: `/kanji/${encodeURIComponent(item.literal)}`,
        branch: "related",
      });
      edges.push({
        from: centerId,
        to: relatedId,
        label:
          item.relation === "same-radical" ? "same radical" : "shared component",
        kind:
          item.relation === "same-radical" ? "shares-radical" : "shares-component",
      });
    }

    return {
      apiVersion: "v2",
      literal: core.literal,
      center: {
        literal: core.literal,
        meanings,
        onReadings,
        kunReadings,
        strokeCount: core.strokeCount,
        grade: core.grade,
        frequencyRank: core.frequencyRank,
      },
      radical: radical
        ? {
            number: radical.number,
            character: radical.character,
            variants: stringArray(radical.variants),
            meaning: radical.meaning,
            reading: radical.reading,
            strokeCount: radical.strokeCount,
          }
        : null,
      components: components.map((row) => ({
        component: row.component,
        position: row.position,
        radicalNumber: row.radicalNumber,
        radicalCharacter: row.radicalCharacter,
        radicalMeaning: row.radicalMeaning ?? "",
      })),
      vocabulary: vocabRows.map((row) => ({
        id: row.id,
        headword: row.headword,
        primaryReading: row.primaryReading,
        firstGloss: glosses.get(row.id) ?? "",
        isCommon: row.isCommon,
      })),
      related,
      graph: { nodes, edges },
      totals: {
        components: components.length,
        vocabulary: vocabTotal,
        related: related.length,
      },
      provenance: importRun
        ? {
            source: core.source,
            license: importRun.license,
            attribution: importRun.attribution,
            isFixture: importRun.isFixture,
          }
        : null,
    };
  }
}
