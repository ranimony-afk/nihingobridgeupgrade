import { SentencePipeline } from "../src/etl/sentence";

async function main() {
  console.log("Starting Phase 4 Sentence ETL Controlled Pilot...");
  const report = await SentencePipeline.run({ limit: 25 });
  console.log("SENTENCE PILOT EXECUTION REPORT:");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
