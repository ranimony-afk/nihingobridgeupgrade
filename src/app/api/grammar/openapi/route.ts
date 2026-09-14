import { jsonOk, optionsHandler } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/grammar/openapi
 *
 * Hand-written OpenAPI 3.1 description of the grammar API. It is generated
 * from the same contract objects the routes return, and is the artefact the
 * Flutter client's code generator consumes.
 */
const SPEC = {
  openapi: "3.1.0",
  info: {
    title: "NihongoBridge Grammar API",
    version: "1.0.0",
    description:
      "Canonical grammar catalogue: curated points, their surface patterns, corpus evidence and cross links into the kanji and vocabulary knowledge graphs.",
    license: {
      name: "Grammar content CC BY-SA 4.0 (NihongoBridge); example sentences EDRDG Licence (Tanaka corpus)",
      url: "https://github.com/ranimony-afk/nihingobridgeupgrade/blob/main/docs/PROVENANCE.md",
    },
  },
  servers: [{ url: "/api", description: "Relative to the deployed origin" }],
  tags: [
    { name: "catalogue" },
    { name: "points" },
    { name: "evidence" },
    { name: "graph" },
    { name: "meta" },
  ],
  paths: {
    "/grammar": {
      get: {
        tags: ["catalogue"],
        summary: "List / filter grammar points",
        parameters: [
          { name: "q", in: "query", schema: { type: "string", maxLength: 160 } },
          { name: "jlpt", in: "query", schema: { type: "integer", minimum: 1, maximum: 5 } },
          { name: "tag", in: "query", schema: { type: "string" } },
          {
            name: "register",
            in: "query",
            schema: { type: "string", enum: ["polite", "casual", "written", "spoken", "neutral"] },
          },
          {
            name: "sort",
            in: "query",
            schema: {
              type: "string",
              enum: ["relevance", "level", "order", "title", "examples"],
              default: "order",
            },
          },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 24 } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
        ],
        responses: {
          200: { $ref: "#/components/responses/Catalogue" },
          400: { $ref: "#/components/responses/Error" },
          429: { $ref: "#/components/responses/Error" },
        },
      },
      options: { tags: ["meta"], summary: "CORS pre-flight", responses: { 204: { description: "No content" } } },
    },
    "/grammar/search": {
      get: {
        tags: ["catalogue"],
        summary: "Scored grammar search",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 24 } },
        ],
        responses: {
          200: {
            description: "Hits with score and matched field",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        query: { type: "string" },
                        hits: {
                          type: "array",
                          items: {
                            allOf: [
                              { $ref: "#/components/schemas/GrammarPointSummary" },
                              {
                                type: "object",
                                properties: {
                                  matchedOn: {
                                    type: "string",
                                    enum: ["title", "pattern", "gloss", "explanation"],
                                  },
                                  score: { type: "integer" },
                                },
                              },
                            ],
                          },
                        },
                      },
                    },
                    meta: { $ref: "#/components/schemas/Meta" },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/grammar/{slug}": {
      get: {
        tags: ["points"],
        summary: "Full grammar point",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "te-shimau" },
          {
            name: "include",
            in: "query",
            description: "Comma separated payload sections",
            schema: {
              type: "string",
              example: "patterns,examples,related,kanji,vocabulary",
            },
          },
        ],
        responses: {
          200: {
            description: "Grammar point detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/GrammarPointDetail" },
                    meta: { $ref: "#/components/schemas/Meta" },
                  },
                },
              },
            },
          },
          404: { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/grammar/{slug}/examples": {
      get: {
        tags: ["evidence"],
        summary: "Paginated corpus examples for a point",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
          { name: "maxLength", in: "query", schema: { type: "integer", minimum: 1, maximum: 400 } },
          { name: "minLength", in: "query", schema: { type: "integer", minimum: 1, maximum: 400 } },
          { name: "sort", in: "query", schema: { type: "string", enum: ["length", "id"], default: "length" } },
        ],
        responses: { 200: { $ref: "#/components/responses/Examples" }, 404: { $ref: "#/components/responses/Error" } },
      },
    },
    "/grammar/{slug}/related": {
      get: {
        tags: ["graph"],
        summary: "Related grammar points (BFS over grammar_relations)",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          {
            name: "relation",
            in: "query",
            schema: {
              type: "string",
              enum: ["prerequisite", "similar", "contrast", "related", "variant"],
            },
          },
          { name: "depth", in: "query", schema: { type: "integer", minimum: 1, maximum: 2, default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 24 } },
        ],
        responses: { 200: { $ref: "#/components/responses/Related" }, 404: { $ref: "#/components/responses/Error" } },
      },
    },
    "/grammar/{slug}/kanji": {
      get: {
        tags: ["points"],
        summary: "Kanji appearing in the point's examples",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { $ref: "#/components/responses/Ok" }, 404: { $ref: "#/components/responses/Error" } },
      },
    },
    "/grammar/{slug}/vocabulary": {
      get: {
        tags: ["points"],
        summary: "Dictionary entries realising the point's patterns",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { $ref: "#/components/responses/Ok" }, 404: { $ref: "#/components/responses/Error" } },
      },
    },
    "/grammar/batch": {
      post: {
        tags: ["points"],
        summary: "Bulk fetch for mobile clients",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["slugs"],
                properties: {
                  slugs: { type: "array", maxItems: 50, items: { type: "string" } },
                  include: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: ["examples", "related", "kanji", "vocabulary", "patterns"],
                    },
                  },
                  examples: { type: "integer", minimum: 0, maximum: 20, default: 3 },
                },
              },
            },
          },
        },
        responses: { 200: { $ref: "#/components/responses/Ok" }, 400: { $ref: "#/components/responses/Error" } },
      },
      get: {
        tags: ["points"],
        summary: "Read-only batch form",
        parameters: [
          { name: "slugs", in: "query", required: true, schema: { type: "string" }, example: "te-shimau,node" },
          { name: "include", in: "query", schema: { type: "string" } },
          { name: "examples", in: "query", schema: { type: "integer", default: 3 } },
        ],
        responses: { 200: { $ref: "#/components/responses/Ok" }, 400: { $ref: "#/components/responses/Error" } },
      },
    },
    "/grammar/graph": {
      get: {
        tags: ["graph"],
        summary: "Relation graph for a level/tag slice",
        parameters: [
          { name: "jlpt", in: "query", schema: { type: "integer", minimum: 1, maximum: 5 } },
          { name: "tag", in: "query", schema: { type: "string" } },
          { name: "relation", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 400, default: 200 } },
        ],
        responses: {
          200: {
            description: "Nodes and edges",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        nodes: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "integer" },
                              slug: { type: "string" },
                              title: { type: "string" },
                              jlptLevel: { type: ["integer", "null"] },
                              depth: { type: "integer" },
                            },
                          },
                        },
                        edges: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              from: { type: "string" },
                              to: { type: "string" },
                              relation: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                    meta: { $ref: "#/components/schemas/Meta" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/grammar/tags": {
      get: { tags: ["meta"], summary: "Tag cloud", responses: { 200: { $ref: "#/components/responses/Ok" } } },
    },
    "/grammar/levels": {
      get: {
        tags: ["meta"],
        summary: "Points and examples per JLPT level",
        responses: { 200: { $ref: "#/components/responses/Ok" } },
      },
    },
    "/grammar/stats": {
      get: {
        tags: ["meta"],
        summary: "Knowledge counters for the grammar domain",
        responses: { 200: { $ref: "#/components/responses/Ok" } },
      },
    },
  },
  components: {
    schemas: {
      GrammarPointSummary: {
        type: "object",
        properties: {
          id: { type: "integer" },
          slug: { type: "string" },
          title: { type: "string" },
          titleEn: { type: ["string", "null"] },
          summary: { type: ["string", "null"] },
          jlptLevel: { type: ["integer", "null"] },
          register: { type: "string" },
          exampleCount: { type: "integer" },
          tags: { type: "array", items: { type: "string" } },
          patterns: { type: "array", items: { type: "string" } },
        },
      },
      GrammarExample: {
        type: "object",
        properties: {
          id: { type: "integer" },
          japanese: { type: "string" },
          english: { type: "string" },
          externalId: { type: ["string", "null"] },
          length: { type: "integer" },
          matches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                matchedText: { type: "string" },
                startIndex: { type: "integer" },
                endIndex: { type: "integer" },
              },
            },
          },
        },
      },
      GrammarPointDetail: {
        allOf: [
          { $ref: "#/components/schemas/GrammarPointSummary" },
          {
            type: "object",
            properties: {
              explanation: { type: ["string", "null"] },
              formation: { type: ["string", "null"] },
              notes: { type: ["string", "null"] },
              patternDetails: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    pattern: { type: "string" },
                    matchText: { type: "string" },
                    isCore: { type: "boolean" },
                    note: { type: ["string", "null"] },
                  },
                },
              },
              examples: { type: "array", items: { $ref: "#/components/schemas/GrammarExample" } },
              related: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "integer" },
                    slug: { type: "string" },
                    title: { type: "string" },
                    relation: { type: "string" },
                    inbound: { type: "boolean" },
                    depth: { type: "integer" },
                  },
                },
              },
            },
          },
        ],
      },
      Meta: {
        type: "object",
        properties: {
          requestId: { type: "string" },
          apiVersion: { type: "string" },
          tookMs: { type: "integer" },
          pagination: {
            type: "object",
            properties: {
              limit: { type: "integer" },
              offset: { type: "integer" },
              total: { type: "integer" },
              hasMore: { type: "boolean" },
              nextOffset: { type: ["integer", "null"] },
            },
          },
        },
      },
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              details: { type: ["array", "object", "null"] },
            },
          },
          meta: { $ref: "#/components/schemas/Meta" },
        },
      },
    },
    responses: {
      Ok: {
        description: "Successful response (envelope: { data, meta })",
        content: {
          "application/json": {
            schema: { type: "object", properties: { data: { type: "object" }, meta: { $ref: "#/components/schemas/Meta" } } },
          },
        },
      },
      Catalogue: {
        description: "Grammar catalogue page",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    points: { type: "array", items: { $ref: "#/components/schemas/GrammarPointSummary" } },
                    filters: { type: "object" },
                  },
                },
                meta: { $ref: "#/components/schemas/Meta" },
              },
            },
          },
        },
      },
      Examples: {
        description: "Example page",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    point: { type: "object" },
                    examples: { type: "array", items: { $ref: "#/components/schemas/GrammarExample" } },
                  },
                },
                meta: { $ref: "#/components/schemas/Meta" },
              },
            },
          },
        },
      },
      Related: {
        description: "Related points",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    root: { type: "string" },
                    related: { type: "array", items: { type: "object" } },
                  },
                },
                meta: { $ref: "#/components/schemas/Meta" },
              },
            },
          },
        },
      },
      Error: {
        description: "Error envelope",
        content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
      },
    },
  },
};

export async function GET() {
  return jsonOk(SPEC, { cacheSeconds: 300, staleSeconds: 3600 });
}

export const OPTIONS = optionsHandler;
