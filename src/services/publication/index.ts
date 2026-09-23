/**
 * Learner publication overlay — Phase 13.5F barrel.
 */
export type {
  CanonicalDictionaryRow,
  PublicationDiagnostic,
  PublicationStore,
  PublishedDictionaryOverride,
  ResolutionSource,
  ResolvedDictionaryEntry,
} from "./types";
export {
  fetchPublishedOverrides,
  mergeDictionaryOverride,
  resolveDictionaryEntries,
  resolveLearnerEntries,
  selectPublishedOverride,
} from "./dictionaryPublicationResolver";
export {
  sortTranslationsVerifiedFirst,
  translationPriorityRank,
} from "./translationPriority";
export type { TranslationPriorityRow } from "./translationPriority";
export {
  createDrizzlePublicationStore,
  defaultPublicationStore,
} from "./drizzlePublicationStore";
