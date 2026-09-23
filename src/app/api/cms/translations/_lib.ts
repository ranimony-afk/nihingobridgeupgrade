import "server-only";

import type { CmsService } from "@/services/cms";
import { CmsError } from "@/services/cms";
import type { CmsItemRecord } from "@/services/cms";

/**
 * Translations slice glue — Phase 13.5C. Same conventions as the 13.5A
 * dictionary slice: thin adapters, whitelisted fields, scope enforced
 * server-side, every decision delegated to CmsService.
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

/** This vertical slice serves `translation` items only. Server-authoritative. */
export const TRANSLATION_CONTENT_TYPE = "translation" as const;

/**
 * Scope gate: fetch the item and prove it belongs to this slice BEFORE any
 * mutation runs. Missing and out-of-scope ids produce the identical 404.
 * contentType is immutable after creation, so the pre-check cannot race.
 */
export async function requireTranslationItem(
  service: CmsService,
  id: string
): Promise<CmsItemRecord> {
  const item = await service.getItem(id);
  if (item.contentType !== TRANSLATION_CONTENT_TYPE) {
    throw CmsError.notFound("CMS item", id);
  }
  return item;
}
