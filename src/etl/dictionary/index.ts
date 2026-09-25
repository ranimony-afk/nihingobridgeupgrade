/**
 * Dictionary ETL Subsystem — Phase 14.2 Barrel Export.
 */

export * from "./types";
export * from "./romaji";
export * from "./transformer";
export * from "./xmlParser";
export * from "./persistenceAdapter";
export * from "./loader";
export * from "./pipeline";
export * from "./pilotData";
export * from "./fixtures";
export {
  JMDICT_SOURCE_ID,
  REJECTED_JMDICT_SOURCE_ID,
  EXPECTED_JMDICT_RELEASE,
  EXPECTED_JMDICT_ENTRIES,
  EXPECTED_JMDICT_BYTES,
  EXPECTED_JMDICT_SHA256,
  EXPECTED_JMDICT_ARCHIVE_SHA256,
  EXPECTED_JMDICT_ARCHIVE_BYTES,
  assertPinnedJmdictSource,
  assertOfficialJmdictHeader,
  assertOfficialEntryCount,
  assertOfficialByteSize,
  assertOfficialSourceScan,
  JmdictByteScan,
  JMDICT_PREAMBLE_SCAN_LIMIT,
} from "./jmdictContract";
export {
  classifyDatabaseTarget,
  deriveTargetIdentityHash,
  isExactLoopbackHost,
  isDomainOrSubdomain,
  forbiddenProductionDomain,
} from "./targetClassification";
export {
  planPersistence,
  summarizePlan,
  resolveConflictPolicy,
  payloadsEqual,
} from "./persistencePlan";
