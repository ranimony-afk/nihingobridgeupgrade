import DictionaryClient from "./DictionaryClient";

export const dynamic = "force-static";

/**
 * Database-free UI route. All dictionary data is loaded by DictionaryClient
 * through the stable /api/dictionary contract.
 */
export default function DictionaryPage() {
  return <DictionaryClient />;
}
