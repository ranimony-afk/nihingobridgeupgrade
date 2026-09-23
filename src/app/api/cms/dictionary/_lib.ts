import "server-only";

import type { CmsService } from "@/services/cms";
import { CmsError } from "@/services/cms";
import type { CmsItemRecord } from "@/services/cms";

/**
 * Dictionary slice glue — Phase 13.5A (shared helpers live in ../_shared).
 */
export {
  cmsErrorResponse,
  ok,
  parseJsonBody,
  readExpectedVersion,
  routeId,
  sanitizeAuditEvents,
} from "../_shared";
export type { RouteParams } from "../_shared";

/** This vertical slice serves `dictionary` items only. Server-authoritative. */
export const DICTIONARY_CONTENT_TYPE = "dictionary" as const;

/**
 * Scope gate: fetch the item and prove it belongs to this slice BEFORE any
 * mutation runs. Missing and out-of-scope ids produce the identical 404 so
 * callers cannot probe for non-dictionary items. Safe against TOCTOU:
 * contentType is immutable after creation (no update path writes it).
 */
export async function requireDictionaryItem(
  service: CmsService,
  id: string
): Promise<CmsItemRecord> {
  const item = await service.getItem(id);
  if (item.contentType !== DICTIONARY_CONTENT_TYPE) {
    throw CmsError.notFound("CMS item", id);
  }
  return item;
}
