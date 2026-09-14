import { db } from "@/db";
import {
  kanaEntries as kanaTable,
  kanjiEntries as kanjiTable,
  kanjiRadicals as radicalsTable,
  kanjiComposition as compositionTable,
  srsDecks as decksTable,
  srsCards as cardsTable,
} from "@/db/schema";
import { and, asc, eq, inArray, like, or, sql } from "drizzle-orm";
import { KANA_ROWS, KANA_SOURCE_REF, buildKanaDataset, type FlatKana } from "@/data/kana";
import {
  COMPOSITION,
  ELEMENTS,
  EXTRA_ELEMENTS,
  KANJI,
  KANJI_SOURCE_REF,
} from "@/data/kanji";

export interface KanaEntry {
  id: string;
  character: string;
  script: "hiragana" | "katakana";
  romaji: string;
  category: string;
  rowKey: string;
  rowLabel: string;
  columnKey: string;
  baseCharacter: string | null;
  mnemonic: string | null;
  sourceRef: string;
  orderIndex: number;
}

export interface KanaChartGroup {
  rowKey: string;
  rowLabel: string;
  category: string;
  hiragana: Array<{ id: string; character: string; romaji: string }>;
  katakana: Array<{ id: string; character: string; romaji: string }>;
}

export interface MindNode {
  id: string;
  character: string;
  label: string;
  kind: "kanji" | "radical" | "primitive";
  meaning: string;
  strokeCount: number;
  role?: string;
  renderedAs?: string;
  position?: string | null;
  /** BFS depth from the centre (0 = centre). */
  depth: number;
  jlptLevel?: string;
  isJlpt: boolean;
}

export interface MindEdge {
  from: string;
  to: string;
  role: string;
  renderedAs: string;
}

export interface MindTree {
  centre: MindNode;
  nodes: MindNode[];
  edges: MindEdge[];
  /** Grouped by depth for the UI rings. */
  rings: Array<{ depth: number; label: string; nodes: MindNode[] }>;
  stats: {
    components: number;
    familySize: number;
    phoneticComponents: string[];
    semanticComponents: string[];
  };
}

export interface KanjiSummary {
  id: string;
  character: string;
  meaning: string;
  readingsKun: string[];
  readingsOn: string[];
  strokeCount: number;
  jlptLevel: string;
  gradeLevel: number | null;
  primaryRadicalId: string | null;
  primaryRadical?: { character: string; meaning: string } | null;
  componentCount: number;
  vocabulary: Array<{ word: string; reading: string; meaning: string }>;
  mnemonic: string | null;
}

export interface ElementSummary {
  id: string;
  character: string;
  altForms: string[];
  meaning: string;
  readingKun: string | null;
  readingOn: string | null;
  strokeCount: number;
  kangxiNumber: number | null;
  category: string;
  typicalRole: string;
  mnemonic: string | null;
  /** Kanji that use this element. */
  usedInCount: number;
}

/** Row labels live in the dataset definition, not the DB, so derive them. */
function rowLabelFor(rowKey: string): string {
  return KANA_ROWS.find((r) => r.rowKey === rowKey)?.rowLabel ?? rowKey;
}

function toKanaEntry(row: typeof kanaTable.$inferSelect): KanaEntry {
  return {
    ...row,
    rowLabel: rowLabelFor(row.rowKey),
    script: row.script as "hiragana" | "katakana",
  };
}

export class KnowledgeService {
  /* ============================================================
   * SEEDING
   * ============================================================ */
  static async ensureSeeded(): Promise<void> {
    const [row] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanaTable);

    if ((row?.count ?? 0) > 0) return;

    /* ---- Kana ---- */
    const kana = buildKanaDataset();
    for (const k of kana) {
      await db.insert(kanaTable).values(k).onConflictDoNothing();
    }

    /* ---- Elements (radicals + primitives) ---- */
    const allElements = [...ELEMENTS, ...EXTRA_ELEMENTS];
    for (const e of allElements) {
      await db
        .insert(radicalsTable)
        .values({
          id: e.id,
          character: e.character,
          altForms: e.altForms,
          meaning: e.meaning,
          readingKun: e.readingKun,
          readingOn: e.readingOn || null,
          strokeCount: e.strokeCount,
          kangxiNumber: e.kangxiNumber,
          category: e.category,
          typicalRole: e.typicalRole,
          mnemonic: e.mnemonic,
          sourceRef: KANJI_SOURCE_REF,
        })
        .onConflictDoNothing();
    }

    /* ---- Kanji headwords ---- */
    for (const k of KANJI) {
      await db
        .insert(kanjiTable)
        .values({
          id: k.id,
          character: k.character,
          meaning: k.meaning,
          readingsKun: k.readingsKun,
          readingsOn: k.readingsOn,
          strokeCount: k.strokeCount,
          jlptLevel: k.jlptLevel,
          gradeLevel: k.gradeLevel,
          primaryRadicalId: k.primaryRadicalId,
          mnemonic: k.mnemonic,
          vocabulary: k.vocabulary,
          sourceRef: KANJI_SOURCE_REF,
        })
        .onConflictDoNothing();
    }

    /* ---- Composition edges ---- */
    for (const c of COMPOSITION) {
      await db
        .insert(compositionTable)
        .values({
          id: `comp-${c.kanjiId}-${c.elementId}-${c.orderIndex}`,
          kanjiId: c.kanjiId,
          elementId: c.elementId,
          role: c.role,
          position: c.position,
          renderedAs: c.renderedAs,
          orderIndex: c.orderIndex,
        })
        .onConflictDoNothing();
    }
  }

  /* ============================================================
   * KANA CHART
   * ============================================================ */
  static async getKanaChart(params: {
    script?: "hiragana" | "katakana";
    category?: string;
  }): Promise<{ groups: KanaChartGroup[]; total: number; sourceRef: string }> {
    await this.ensureSeeded();

    const conditions = [];
    if (params.script) conditions.push(eq(kanaTable.script, params.script));
    if (params.category) conditions.push(eq(kanaTable.category, params.category));

    const rows = conditions.length
      ? await db
          .select()
          .from(kanaTable)
          .where(and(...conditions))
          .orderBy(asc(kanaTable.orderIndex))
      : await db.select().from(kanaTable).orderBy(asc(kanaTable.orderIndex));

    // Rebuild the chart grid from the authoritative KANA_ROWS layout so the
    // API always returns a renderable table regardless of DB filters.
    const byChar = new Map(rows.map((r) => [r.character, r]));

    const groups: KanaChartGroup[] = KANA_ROWS.filter(
      (row) => !params.category || row.category === params.category
    ).map((row) => ({
      rowKey: row.rowKey,
      rowLabel: row.rowLabel,
      category: row.category,
      hiragana: row.cells
        .map(([romaji, hira], i) => {
          const found = byChar.get(hira);
          return found
            ? { id: found.id, character: found.character, romaji: found.romaji }
            : { id: `hira-${romaji}-${row.rowKey}`, character: hira, romaji };
        })
        .filter((c) => !params.script || params.script === "hiragana"),
      katakana: row.cells
        .map(([romaji, , kata], i) => {
          const found = byChar.get(kata);
          return found
            ? { id: found.id, character: found.character, romaji: found.romaji }
            : { id: `kata-${romaji}-${row.rowKey}`, character: kata, romaji };
        })
        .filter((c) => !params.script || params.script === "katakana"),
    }));

    return { groups, total: rows.length, sourceRef: KANA_SOURCE_REF };
  }

  static async searchKana(keyword: string): Promise<KanaEntry[]> {
    await this.ensureSeeded();
    const rows = await db
      .select()
      .from(kanaTable)
      .where(or(like(kanaTable.romaji, `%${keyword}%`), eq(kanaTable.character, keyword)))
      .orderBy(asc(kanaTable.orderIndex))
      .limit(40);
    return rows.map(toKanaEntry);
  }

  static async getKanaById(id: string): Promise<KanaEntry | null> {
    await this.ensureSeeded();
    const [row] = await db.select().from(kanaTable).where(eq(kanaTable.id, id)).limit(1);
    return row ? toKanaEntry(row) : null;
  }

  /* ============================================================
   * KANJI LIST
   * ============================================================ */
  static async listKanji(params: {
    level?: string;
    elementId?: string;
    keyword?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ kanji: KanjiSummary[]; total: number }> {
    await this.ensureSeeded();

    let ids: string[] | null = null;

    if (params.elementId) {
      const rows = await db
        .select({ kanjiId: compositionTable.kanjiId })
        .from(compositionTable)
        .where(eq(compositionTable.elementId, params.elementId));
      ids = rows.map((r) => r.kanjiId);
      if (ids.length === 0) return { kanji: [], total: 0 };
    }

    const conditions = [];
    if (params.level) conditions.push(eq(kanjiTable.jlptLevel, params.level));
    if (ids) conditions.push(inArray(kanjiTable.id, ids));
    if (params.keyword) {
      conditions.push(
        or(
          like(kanjiTable.character, `%${params.keyword}%`),
          like(kanjiTable.meaning, `%${params.keyword}%`)
        )!
      );
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const countBase = db.select({ count: sql<number>`cast(count(*) as int)` }).from(kanjiTable);
    const [countRow] = where ? await countBase.where(where) : await countBase;

    let rowsQuery = db.select().from(kanjiTable);
    if (where) rowsQuery = rowsQuery.where(where) as typeof rowsQuery;

    const rows = await rowsQuery
      .orderBy(asc(kanjiTable.jlptLevel), asc(kanjiTable.strokeCount))
      .limit(params.limit ?? 200)
      .offset(params.offset ?? 0);

    /* Attach primary radical + component counts in bulk. */
    const elementIds = Array.from(
      new Set(rows.map((r) => r.primaryRadicalId).filter((v): v is string => Boolean(v)))
    );
    const elementRows = elementIds.length
      ? await db.select().from(radicalsTable).where(inArray(radicalsTable.id, elementIds))
      : [];
    const elementMap = new Map(elementRows.map((e) => [e.id, e]));

    const kanjiIds = rows.map((r) => r.id);
    const compCounts = kanjiIds.length
      ? await db
          .select({ kanjiId: compositionTable.kanjiId, count: sql<number>`cast(count(*) as int)` })
          .from(compositionTable)
          .where(inArray(compositionTable.kanjiId, kanjiIds))
          .groupBy(compositionTable.kanjiId)
      : [];
    const compMap = new Map(compCounts.map((c) => [c.kanjiId, c.count]));

    return {
      kanji: rows.map((r) => {
        const el = r.primaryRadicalId ? elementMap.get(r.primaryRadicalId) : null;
        return {
          id: r.id,
          character: r.character,
          meaning: r.meaning,
          readingsKun: r.readingsKun,
          readingsOn: r.readingsOn,
          strokeCount: r.strokeCount,
          jlptLevel: r.jlptLevel,
          gradeLevel: r.gradeLevel,
          primaryRadicalId: r.primaryRadicalId,
          primaryRadical: el ? { character: el.character, meaning: el.meaning } : null,
          componentCount: compMap.get(r.id) ?? 0,
          vocabulary: r.vocabulary,
          mnemonic: r.mnemonic,
        };
      }),
      total: countRow?.count ?? 0,
    };
  }

  /* ============================================================
   * ELEMENTS (radicals + primitives)
   * ============================================================ */
  static async listElements(category?: string): Promise<ElementSummary[]> {
    await this.ensureSeeded();

    const rows = category
      ? await db
          .select()
          .from(radicalsTable)
          .where(eq(radicalsTable.category, category))
          .orderBy(asc(radicalsTable.strokeCount), asc(radicalsTable.character))
      : await db
          .select()
          .from(radicalsTable)
          .orderBy(asc(radicalsTable.strokeCount), asc(radicalsTable.character));

    const usage = await db
      .select({
        elementId: compositionTable.elementId,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(compositionTable)
      .groupBy(compositionTable.elementId);
    const usageMap = new Map(usage.map((u) => [u.elementId, u.count]));

    return rows.map((r) => ({
      id: r.id,
      character: r.character,
      altForms: r.altForms,
      meaning: r.meaning,
      readingKun: r.readingKun,
      readingOn: r.readingOn,
      strokeCount: r.strokeCount,
      kangxiNumber: r.kangxiNumber,
      category: r.category,
      typicalRole: r.typicalRole,
      mnemonic: r.mnemonic,
      usedInCount: usageMap.get(r.id) ?? 0,
    }));
  }

  /* ============================================================
   * MIND TREE
   * Build the graph around a kanji: its components, then the "family"
   * of other kanji that share those components (BFS to depth 2).
   * ============================================================ */
  static async buildMindTree(character: string): Promise<MindTree | null> {
    await this.ensureSeeded();

    const [centre] = await db
      .select()
      .from(kanjiTable)
      .where(eq(kanjiTable.character, character))
      .limit(1);

    if (!centre) return null;

    const nodeFor = (
      n: Omit<MindNode, "depth">,
      depth: number
    ): MindNode => ({ ...n, depth });

    const centreNode = nodeFor(
      {
        id: centre.id,
        character: centre.character,
        label: centre.character,
        kind: "kanji",
        meaning: centre.meaning,
        strokeCount: centre.strokeCount,
        jlptLevel: centre.jlptLevel,
        isJlpt: true,
      },
      0
    );

    const nodes = new Map<string, MindNode>([[centre.id, centreNode]]);
    const edges: MindEdge[] = [];

    /* ---------- Depth 1: components of the centre kanji ---------- */
    const componentRows = await db
      .select()
      .from(compositionTable)
      .where(eq(compositionTable.kanjiId, centre.id))
      .orderBy(asc(compositionTable.orderIndex));

    const elementIds = componentRows.map((c) => c.elementId);
    const elementRows = elementIds.length
      ? await db.select().from(radicalsTable).where(inArray(radicalsTable.id, elementIds))
      : [];
    const elementMap = new Map(elementRows.map((e) => [e.id, e]));

    for (const comp of componentRows) {
      const el = elementMap.get(comp.elementId);
      if (!el) continue;

      if (!nodes.has(el.id)) {
        nodes.set(
          el.id,
          nodeFor(
            {
              id: el.id,
              character: comp.renderedAs,
              label: el.character,
              kind: el.category === "radical" ? "radical" : "primitive",
              meaning: el.meaning,
              strokeCount: el.strokeCount,
              role: comp.role,
              renderedAs: comp.renderedAs,
              position: comp.position,
              isJlpt: false,
            },
            1
          )
        );
      }
      edges.push({ from: centre.id, to: el.id, role: comp.role, renderedAs: comp.renderedAs });
    }

    /* ---------- Depth 2: sibling kanji sharing each component ---------- */
    const siblings = elementIds.length
      ? await db
          .select()
          .from(compositionTable)
          .where(inArray(compositionTable.elementId, elementIds))
      : [];

    const siblingKanjiIds = Array.from(
      new Set(siblings.filter((s) => s.kanjiId !== centre.id).map((s) => s.kanjiId))
    );
    const siblingKanji = siblingKanjiIds.length
      ? await db.select().from(kanjiTable).where(inArray(kanjiTable.id, siblingKanjiIds))
      : [];
    const siblingMap = new Map(siblingKanji.map((k) => [k.id, k]));

    for (const link of siblings) {
      if (link.kanjiId === centre.id) continue;
      const k = siblingMap.get(link.kanjiId);
      const el = elementMap.get(link.elementId);
      if (!k || !el) continue;

      if (!nodes.has(k.id)) {
        nodes.set(
          k.id,
          nodeFor(
            {
              id: k.id,
              character: k.character,
              label: k.character,
              kind: "kanji",
              meaning: k.meaning,
              strokeCount: k.strokeCount,
              jlptLevel: k.jlptLevel,
              isJlpt: true,
            },
            2
          )
        );
      }
      edges.push({ from: el.id, to: k.id, role: link.role, renderedAs: link.renderedAs });
    }

    /* ---------- Ring grouping ---------- */
    const ringLabels: Record<number, string> = {
      0: "This kanji",
      1: "Components (parts)",
      2: "Family (shares a component)",
    };

    const rings = [0, 1, 2]
      .map((depth) => ({
        depth,
        label: ringLabels[depth],
        nodes: Array.from(nodes.values()).filter((n) => n.depth === depth),
      }))
      .filter((r) => r.nodes.length > 0);

    return {
      centre: centreNode,
      nodes: Array.from(nodes.values()),
      edges,
      rings,
      stats: {
        components: componentRows.length,
        familySize: siblingKanjiIds.length,
        phoneticComponents: componentRows
          .filter((c) => c.role === "phonetic")
          .map((c) => c.renderedAs),
        semanticComponents: componentRows
          .filter((c) => c.role === "semantic")
          .map((c) => c.renderedAs),
      },
    };
  }

  static async getKanjiDetail(character: string) {
    await this.ensureSeeded();

    const [row] = await db
      .select()
      .from(kanjiTable)
      .where(eq(kanjiTable.character, character))
      .limit(1);
    if (!row) return null;

    const [tree, profile] = await Promise.all([
      this.buildMindTree(character),
      this.getKanjiProfile(row.id),
    ]);

    return { kanji: row, tree, profile };
  }

  /** Study-oriented view of one kanji: readings, vocab, composition, mnemonic. */
  static async getKanjiProfile(kanjiId: string) {
    const comps = await db
      .select()
      .from(compositionTable)
      .where(eq(compositionTable.kanjiId, kanjiId))
      .orderBy(asc(compositionTable.orderIndex));

    const elementIds = comps.map((c) => c.elementId);
    const elements = elementIds.length
      ? await db.select().from(radicalsTable).where(inArray(radicalsTable.id, elementIds))
      : [];
    const elMap = new Map(elements.map((e) => [e.id, e]));

    return comps.map((c) => {
      const el = elMap.get(c.elementId);
      return {
        id: c.id,
        role: c.role,
        position: c.position,
        renderedAs: c.renderedAs,
        element: el
          ? {
              id: el.id,
              character: el.character,
              meaning: el.meaning,
              readingKun: el.readingKun,
              readingOn: el.readingOn,
              strokeCount: el.strokeCount,
              category: el.category,
              mnemonic: el.mnemonic,
              altForms: el.altForms,
            }
          : null,
      };
    });
  }

  /* ============================================================
   * SRS INTEGRATION — turn knowledge rows into reviewable cards
   * ============================================================ */
  static async addKanaToSrs(input: { kanaId: string; userId?: string }): Promise<{
    cardId: string;
    deckId: string;
    created: boolean;
    front: string;
    back: string;
  } | null> {
    await this.ensureSeeded();

    const [kanaRow] = await db
      .select()
      .from(kanaTable)
      .where(eq(kanaTable.id, input.kanaId))
      .limit(1);
    if (!kanaRow) return null;
    const kana = toKanaEntry(kanaRow);

    const deckId = `deck-kana-${kana.script}`;
    await this.ensureDeck({
      deckId,
      name: kana.script === "hiragana" ? "Kana — Hiragana Chart" : "Kana — Katakana Chart",
      description:
        "Kana cards generated directly from the interactive kana chart. Reading recall, symbol → romaji.",
      jlptLevel: "N5",
    });

    const existing = await this.findExistingCard(deckId, kana.character);
    if (existing) {
      return {
        cardId: existing,
        deckId,
        created: false,
        front: kana.character,
        back: `${kana.romaji} (${kana.rowLabel})`,
      };
    }

    const cardId = `card-kana-${kana.id}`;
    await db
      .insert(cardsTable)
      .values({
        id: cardId,
        deckId,
        userId: input.userId || "anonymous-user",
        cardType: "kana",
        front: kana.character,
        back: kana.romaji,
        reading: kana.romaji,
        meaning: `${kana.category} kana, ${kana.rowLabel} row`,
        hint: kana.mnemonic,
        sourceType: "kana_chart",
        sourceRef: kana.sourceRef,
        sourceQuestionId: kana.id,
        schedulerKey: "sm2",
        dueAt: new Date(),
        phase: "learning",
        isLearning: true,
      })
      .onConflictDoNothing();

    return { cardId, deckId, created: true, front: kana.character, back: kana.romaji };
  }

  static async addKanjiToSrs(input: { character: string; userId?: string }) {
    await this.ensureSeeded();

    const [kanji] = await db
      .select()
      .from(kanjiTable)
      .where(eq(kanjiTable.character, input.character))
      .limit(1);
    if (!kanji) return null;

    const deckId = `deck-kanji-${kanji.jlptLevel.toLowerCase()}`;
    await this.ensureDeck({
      deckId,
      name: `Kanji ${kanji.jlptLevel} — Mind Tree`,
      description:
        "Kanji cards generated from the mind tree. Front shows the character plus its components as a hint.",
      jlptLevel: kanji.jlptLevel,
    });

    const existing = await this.findExistingCard(deckId, kanji.character);
    if (existing) {
      return {
        cardId: existing,
        deckId,
        created: false,
        front: kanji.character,
        back: `${kanji.readingsOn.join(", ") || "—"} · ${kanji.readingsKun.join(", ") || "—"} — ${kanji.meaning}`,
      };
    }

    const comps = await db
      .select()
      .from(compositionTable)
      .where(eq(compositionTable.kanjiId, kanji.id))
      .orderBy(asc(compositionTable.orderIndex));

    const cardId = `card-kanji-${kanji.id}`;
    await db
      .insert(cardsTable)
      .values({
        id: cardId,
        deckId,
        userId: input.userId || "anonymous-user",
        cardType: "kanji",
        front: kanji.character,
        back: `${kanji.readingsOn.join(", ") || "—"} · ${kanji.readingsKun.join(", ") || "—"} — ${kanji.meaning}`,
        reading: kanji.readingsOn[0] ?? kanji.readingsKun[0] ?? null,
        meaning: kanji.meaning,
        hint: comps.length > 0 ? `Built from: ${comps.map((c) => c.renderedAs).join(" + ")}` : null,
        sourceType: "kanji_mindtree",
        sourceRef: kanji.sourceRef,
        sourceQuestionId: kanji.id,
        schedulerKey: "fsrs-lite",
        dueAt: new Date(),
        phase: "learning",
        isLearning: true,
      })
      .onConflictDoNothing();

    return {
      cardId,
      deckId,
      created: true,
      front: kanji.character,
      back: `${kanji.readingsOn.join(", ")} — ${kanji.meaning}`,
    };
  }

  /** Add every kana in a chart group as cards (bulk chart → deck). */
  static async addKanaRowToSrs(input: {
    rowKey: string;
    script: "hiragana" | "katakana";
    userId?: string;
  }): Promise<{ created: number; skipped: number; deckId: string }> {
    await this.ensureSeeded();

    const rows = await db
      .select()
      .from(kanaTable)
      .where(and(eq(kanaTable.rowKey, input.rowKey), eq(kanaTable.script, input.script)))
      .orderBy(asc(kanaTable.orderIndex));

    let created = 0;
    let skipped = 0;
    for (const k of rows) {
      const res = await this.addKanaToSrs({ kanaId: k.id, userId: input.userId });
      if (res?.created) created += 1;
      else skipped += 1;
    }

    return {
      created,
      skipped,
      deckId: `deck-kana-${input.script}`,
    };
  }

  private static async ensureDeck(input: {
    deckId: string;
    name: string;
    description: string;
    jlptLevel: string;
  }): Promise<void> {
    await db
      .insert(decksTable)
      .values({
        id: input.deckId,
        name: input.name,
        description: input.description,
        jlptLevel: input.jlptLevel,
        ownerId: "anonymous-user",
        schedulerKey: "sm2",
        schedulerParams: {},
      })
      .onConflictDoNothing();
  }

  private static async findExistingCard(deckId: string, front: string): Promise<string | null> {
    const [row] = await db
      .select({ id: cardsTable.id })
      .from(cardsTable)
      .where(and(eq(cardsTable.deckId, deckId), eq(cardsTable.front, front)))
      .limit(1);
    return row?.id ?? null;
  }

  /* ============================================================
   * STATS
   * ============================================================ */
  static async getKnowledgeStats() {
    await this.ensureSeeded();

    const [kana] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanaTable);
    const [kanji] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(kanjiTable);
    const [elements] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(radicalsTable);
    const [edges] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(compositionTable);

    const byLevel = await db
      .select({ level: kanjiTable.jlptLevel, count: sql<number>`cast(count(*) as int)` })
      .from(kanjiTable)
      .groupBy(kanjiTable.jlptLevel);

    return {
      kanaEntries: kana?.count ?? 0,
      kanjiEntries: kanji?.count ?? 0,
      elements: elements?.count ?? 0,
      compositionEdges: edges?.count ?? 0,
      byJlptLevel: byLevel,
      sourceRef: KANJI_SOURCE_REF,
    };
  }
}
