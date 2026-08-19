import "dotenv/config";
import { importCoreCorpus, importSimulated } from "../src/lib/kg/import";
import { importJsonlFromDir } from "../src/lib/kg/etl/files";
import { graphStats } from "../src/lib/kg/search";

async function main() {
  const mode = process.argv[2] ?? "core";
  if (mode === "core") {
    console.log(await importCoreCorpus());
  } else if (mode === "simulate") {
    const limit = Number(process.argv[3] ?? 200);
    console.log(await importSimulated(limit));
  } else if (mode === "files") {
    console.log(await importJsonlFromDir());
  } else if (mode === "stats") {
    console.log(await graphStats());
  } else {
    console.log("usage: tsx scripts/kg-etl.ts core|simulate|files|stats [limit]");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
