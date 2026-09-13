import DictionaryDetailClient from "./DictionaryDetailClient";

export const dynamic = "force-static";

/**
 * Database-free UI route. Entry data is loaded by DictionaryDetailClient via
 * the stable /api/v2/dictionary/entries/:id contract.
 */
export default async function DictionaryEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DictionaryDetailClient entryId={Number.parseInt(id, 10)} />;
}
