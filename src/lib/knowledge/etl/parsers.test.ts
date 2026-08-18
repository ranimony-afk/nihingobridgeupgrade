import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseJmdict, parseKanjidic2, parseTatoebaSentences } from "@/lib/knowledge/etl/parsers";
import type { ImportRecord } from "@/lib/knowledge/etl/types";

const temporaryDirectories: string[] = [];

async function fixture(name: string, content: string) {
  const directory = await mkdtemp(join(tmpdir(), "nihongobridge-knowledge-"));
  temporaryDirectories.push(directory);
  const path = join(directory, name);
  await writeFile(path, content, "utf8");
  return path;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("knowledge source parsers", () => {
  it("normalizes a JMdict entry with spelling, reading, and English gloss", async () => {
    const filePath = await fixture("jmdict.xml", `<?xml version="1.0"?><JMdict><entry><ent_seq>1001</ent_seq><k_ele><keb>日本</keb><ke_pri>ichi1</ke_pri></k_ele><r_ele><reb>にほん</reb></r_ele><sense><pos>noun</pos><gloss xml:lang="eng">Japan</gloss></sense></entry></JMdict>`);
    const records: ImportRecord[] = [];
    await parseJmdict(filePath, async (record) => { records.push(record); });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: "lexeme", value: { externalId: "1001", common: true } });
    if (records[0]?.kind !== "lexeme") throw new Error("Expected lexeme record");
    expect(records[0].value.spellings[0]?.spelling).toBe("日本");
    expect(records[0].value.readings[0]?.reading).toBe("にほん");
    expect(records[0].value.senses[0]?.glosses[0]?.gloss).toBe("Japan");
  });

  it("normalizes KANJIDIC2 character metadata", async () => {
    const filePath = await fixture("kanjidic2.xml", `<?xml version="1.0"?><kanjidic2><character><literal>日</literal><radical><rad_value rad_type="classical">72</rad_value></radical><misc><grade>1</grade><stroke_count>4</stroke_count><freq>5</freq><jlpt>4</jlpt></misc><reading_meaning><rmgroup><reading r_type="ja_on">ニチ</reading><meaning m_lang="en">day</meaning></rmgroup></reading_meaning></character></kanjidic2>`);
    const records: ImportRecord[] = [];
    await parseKanjidic2(filePath, async (record) => { records.push(record); });

    expect(records).toHaveLength(1);
    if (records[0]?.kind !== "kanji") throw new Error("Expected kanji record");
    expect(records[0].value.literal).toBe("日");
    expect(records[0].value.strokeCount).toBe(4);
    expect(records[0].value.readings[0]?.reading).toBe("ニチ");
    expect(records[0].value.meanings[0]?.meaning).toBe("day");
  });

  it("streams tab-delimited Tatoeba sentence rows", async () => {
    const filePath = await fixture("sentences.tsv", "1\tjpn\tこんにちは。\n2\teng\tHello.\n");
    const records: ImportRecord[] = [];
    await parseTatoebaSentences(filePath, async (record) => { records.push(record); });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ kind: "sentence", value: { externalId: "1", language: "jpn", text: "こんにちは。" } });
  });
});
