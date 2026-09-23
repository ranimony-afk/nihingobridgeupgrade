import { DictionaryPipeline } from "../src/etl/dictionary";

async function main() {
  console.log("Starting Phase 3 Dictionary ETL Controlled Pilot...");
  const report = await DictionaryPipeline.run({ limit: 50 });
  console.log("PILOT EXECUTION REPORT:");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
