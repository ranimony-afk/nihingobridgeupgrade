import "dotenv/config";
import { seedDictionaryFixturesForDisposableDatabase } from "../src/services/dictionary/fixtureSetup";

async function main() {
  await seedDictionaryFixturesForDisposableDatabase();
  console.log("First-party dictionary and knowledge fixtures are ready in the disposable database.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Dictionary fixture setup failed");
  process.exitCode = 1;
});
