import { z } from "zod";

import { badRequest } from "@/lib/api/http";

/** Shared query validation for the grammar API. */

export const jlpt = z.coerce.number().int().min(1).max(5);

export const grammarListQuery = z.object({
  q: z.string().trim().max(160).optional(),
  jlpt: jlpt.optional(),
  tag: z.string().trim().max(64).optional(),
  register: z.enum(["polite", "casual", "written", "spoken", "neutral"]).optional(),
  sort: z.enum(["relevance", "level", "order", "title", "examples"]).default("order"),
  limit: z.coerce.number().int().min(1).max(200).default(24),
  offset: z.coerce.number().int().min(0).default(0),
  include: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
});

export const grammarExamplesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  maxLength: z.coerce.number().int().min(1).max(400).optional(),
  minLength: z.coerce.number().int().min(1).max(400).optional(),
  sort: z.enum(["length", "id"]).default("length"),
});

export const grammarRelatedQuery = z.object({
  relation: z
    .enum(["prerequisite", "similar", "contrast", "related", "variant"])
    .optional(),
  depth: z.coerce.number().int().min(1).max(2).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export const grammarGraphQuery = z.object({
  jlpt: jlpt.optional(),
  tag: z.string().trim().max(64).optional(),
  relation: z
    .enum(["prerequisite", "similar", "contrast", "related", "variant"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(400).default(200),
});

export const grammarBatchBody = z.object({
  slugs: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
  include: z
    .array(z.enum(["examples", "related", "kanji", "vocabulary", "patterns"]))
    .optional(),
  examples: z.coerce.number().int().min(0).max(20).default(3),
});

export type GrammarListQuery = z.infer<typeof grammarListQuery>;
export type GrammarExamplesQuery = z.infer<typeof grammarExamplesQuery>;
export type GrammarRelatedQuery = z.infer<typeof grammarRelatedQuery>;
export type GrammarGraphQuery = z.infer<typeof grammarGraphQuery>;
export type GrammarBatchBody = z.infer<typeof grammarBatchBody>;

/**
 * Parses `URLSearchParams` against a zod schema.
 * Returns either the parsed data or a ready-to-return 400 response.
 */
export function parseQuery<S extends z.ZodTypeAny>(
  params: URLSearchParams,
  schema: S,
): { ok: true; data: z.infer<S> } | { ok: false; response: ReturnType<typeof badRequest> } {
  const raw: Record<string, string> = {};
  for (const key of params.keys()) {
    const value = params.get(key);
    if (value !== null) raw[key] = value;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: badRequest(
        "Invalid query parameters",
        parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

export async function parseJsonBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: ReturnType<typeof badRequest> }> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return { ok: false, response: badRequest("Request body must be valid JSON") };
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      response: badRequest(
        "Invalid request body",
        parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
