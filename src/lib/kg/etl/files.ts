import { readFile, readdir } from "fs/promises";
import path from "path";
import { db } from "@/db";
import { kgLexemes } from "@/db/schema";
import { checksum, validateLexeme } from "../validate";

export type FileLexeme = {
  seq: string;
  lemma: string;
  reading: string;
  pos?: string;
  glosses: string[];
};

export function parseJmdictJsonl(text: string) {
  const rows: FileLexeme[] = [];
  const issues: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as FileLexeme;
      const problems = validateLexeme({ lemma: row.lemma, reading: row.reading, glosses: row.glosses ?? [] });
      if (problems.length) {
        issues.push(`${row.seq}: ${problems[0]?.message}`);
        continue;
      }
      rows.push(row);
    } catch {
      issues.push("invalid jsonl line");
    }
  }
  return { rows, issues };
}

export async function importJsonlFromDir(dir = "data/kg") {
  let imported = 0;
  try {
    const files = (await readdir(dir)).filter((name) => name.endsWith(".jsonl"));
    for (const file of files) {
      const text = await readFile(path.join(dir, file), "utf8");
      const { rows } = parseJmdictJsonl(text);
      for (const row of rows) {
        await db
          .insert(kgLexemes)
          .values({
            id: `lex-file-${row.seq}`,
            sourceId: "jmdict",
            externalId: row.seq,
            lemma: row.lemma,
            reading: row.reading,
            pos: row.pos ?? "unknown",
            searchDocument: `${row.lemma} ${row.reading} ${row.glosses.join(" ")}`,
            checksum: checksum([row.seq, row.lemma]),
          })
          .onConflictDoNothing();
        imported += 1;
      }
    }
  } catch {
    return { imported: 0, missingDir: true };
  }
  return { imported, missingDir: false };
}
