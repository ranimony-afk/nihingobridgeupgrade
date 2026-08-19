import { eq, like } from "drizzle-orm";
import { db } from "@/db";
import {
  kgKanji,
  kgKanjiEdges,
  kgKanjiMeta,
  kgKanjiRadicals,
  kgKanjiReadings,
  kgLexemes,
  kgRadicals,
  systemSettings,
} from "@/db/schema";
import { kanjiDetail } from "@/lib/kg/search";
import { mindTree, type MindNode } from "./tree";

export type { MindNode };
export { mindTree };

export const BRANCHES: Record<string, string[]> = {
  Nature: ["山", "川", "水", "火", "木", "土", "雨", "金"],
  Humans: ["人", "生", "先", "食"],
  Numbers: ["一"],
  Actions: ["学", "語"],
  Compass: ["東", "西", "南", "北", "中"],
  Time: ["日", "月", "年"],
};

const META: Record<string, { history: string; origin: string; mnemonic: string; rtk: number; wk: number; nanori: string }> = {
  日: { history: "Oracle bone sun disk.", origin: "pictograph of the sun", mnemonic: "a window on the sun", rtk: 12, wk: 1, nanori: "ひ" },
  山: { history: "Three peaks.", origin: "pictograph of a mountain range", mnemonic: "three spikes of earth", rtk: 768, wk: 1, nanori: "やま" },
  川: { history: "Flowing streams.", origin: "water channels", mnemonic: "three currents", rtk: 127, wk: 1, nanori: "かわ" },
  人: { history: "A walking figure.", origin: "side view of a person", mnemonic: "two legs walking", rtk: 951, wk: 1, nanori: "と" },
  水: { history: "Splashing streams.", origin: "water ripples", mnemonic: "a splash of drops", rtk: 130, wk: 2, nanori: "みず" },
  火: { history: "Flames rising.", origin: "hearth fire", mnemonic: "person with sparks", rtk: 161, wk: 2, nanori: "ひ" },
  木: { history: "Tree with roots.", origin: "trunk and branches", mnemonic: "a wooden cross", rtk: 195, wk: 2, nanori: "き" },
  東: { history: "Sun behind a tree.", origin: "sun rising through woods", mnemonic: "sun tangled in wood", rtk: 504, wk: 5, nanori: "あずま" },
  本: { history: "Root of the tree.", origin: "tree marked at the base", mnemonic: "book at the roots", rtk: 211, wk: 3, nanori: "もと" },
  学: { history: "Child under a roof.", origin: "learning hall", mnemonic: "kids under cover", rtk: 324, wk: 4, nanori: "まな" },
};

export async function enrichKanjiExplorer() {
  const kanji = await db.select().from(kgKanji);
  const byChar = new Map(kanji.map((row) => [row.character, row]));

  const radicalSeed = [
    { id: "rad-sun", character: "日", meaning: "sun", strokes: 4 },
    { id: "rad-person", character: "人", meaning: "person", strokes: 2 },
    { id: "rad-water", character: "水", meaning: "water", strokes: 4 },
    { id: "rad-tree", character: "木", meaning: "tree", strokes: 4 },
    { id: "rad-fire", character: "火", meaning: "fire", strokes: 4 },
    { id: "rad-earth", character: "土", meaning: "earth", strokes: 3 },
  ];
  for (const radical of radicalSeed) {
    await db.insert(kgRadicals).values(radical).onConflictDoNothing();
  }

  let metas = 0;
  for (const [branch, chars] of Object.entries(BRANCHES)) {
    for (const ch of chars) {
      const row = byChar.get(ch);
      if (!row) continue;
      const extra = META[ch] ?? {
        history: `Classical form of ${ch}.`,
        origin: `semantic branch ${branch}`,
        mnemonic: row.heisig || branch,
        rtk: row.freq ?? 0,
        wk: 3,
        nanori: "",
      };
      await db
        .insert(kgKanjiMeta)
        .values({
          kanjiId: row.id,
          branch,
          history: extra.history,
          origin: extra.origin,
          mnemonic: extra.mnemonic,
          rtkIndex: extra.rtk,
          rtkKeyword: row.heisig,
          wanikani: extra.wk,
          nanori: extra.nanori,
        })
        .onConflictDoNothing();
      metas += 1;
      if (row.radical) {
        const [rad] = await db.select().from(kgRadicals).where(eq(kgRadicals.character, row.radical));
        if (rad) {
          await db.insert(kgKanjiRadicals).values({ kanjiId: row.id, radicalId: rad.id }).onConflictDoNothing();
        }
      }
      if (extra.nanori) {
        await db
          .insert(kgKanjiReadings)
          .values({ id: `nanori-${ch}`, kanjiId: row.id, kind: "nanori", reading: extra.nanori })
          .onConflictDoNothing();
      }
    }
  }

  const pairs: Array<[string, string, string]> = [
    ["日", "月", "semantic"],
    ["山", "川", "semantic"],
    ["東", "西", "semantic"],
    ["南", "北", "semantic"],
    ["木", "本", "radical"],
    ["木", "東", "radical"],
    ["人", "生", "semantic"],
    ["学", "校", "compound"],
    ["電", "車", "compound"],
  ];
  for (const [from, to, kind] of pairs) {
    const a = byChar.get(from);
    const b = byChar.get(to);
    if (!a || !b) continue;
    await db.insert(kgKanjiEdges).values({ id: `ked-${from}-${to}-${kind}`, fromId: a.id, toId: b.id, kind }).onConflictDoNothing();
  }

  const marked = await db.select().from(systemSettings).where(eq(systemSettings.key, "phase7_kanji"));
  if (marked.length === 0) {
    await db.insert(systemSettings).values({ key: "phase7_kanji", value: "1" });
  }
  return { metas, nodes: kanji.length };
}

export async function explorerCard(character: string) {
  const base = await kanjiDetail(character);
  if (!base) return null;
  const [meta] = await db.select().from(kgKanjiMeta).where(eq(kgKanjiMeta.kanjiId, base.kanji.id));
  const radicalRows = await db.select().from(kgKanjiRadicals).where(eq(kgKanjiRadicals.kanjiId, base.kanji.id));
  const radicals = [];
  for (const row of radicalRows) {
    const [rad] = await db.select().from(kgRadicals).where(eq(kgRadicals.id, row.radicalId));
    if (rad) radicals.push(rad);
  }
  const edges = await db.select().from(kgKanjiEdges).where(eq(kgKanjiEdges.fromId, base.kanji.id));
  const relations = [];
  for (const edge of edges) {
    const [other] = await db.select().from(kgKanji).where(eq(kgKanji.id, edge.toId));
    if (other) relations.push({ ...other, kind: edge.kind });
  }
  const compounds = await db.select().from(kgLexemes).where(like(kgLexemes.lemma, `%${character}%`));
  return {
    ...base,
    meta: meta ?? null,
    radicals,
    relations,
    compounds: compounds.slice(0, 12),
    rare: (base.kanji.freq ?? 9999) > 300 || base.kanji.strokes >= 12,
  };
}

export async function explorerTree() {
  const kanji = await db.select().from(kgKanji);
  const metas = await db.select().from(kgKanjiMeta);
  const branchById = new Map(metas.map((row) => [row.kanjiId, row.branch]));
  return mindTree(kanji.map((row) => ({ character: row.character, branch: branchById.get(row.id) })));
}
