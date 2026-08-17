/**
 * Mobile Platform Utilities (Phase 7 / Phase 9)
 *
 * Dedicated for Flutter, React Native, iOS (Swift), and Android (Kotlin) clients:
 *  - JWT sign & verify (HMAC SHA-256)
 *  - Header-based Bearer token extraction
 *  - Pagination, sorting, and metadata envelopes
 *  - Sliding-window rate limiter
 *  - Full OpenAPI 3.0.0 schema specification generator
 *  - Future GraphQL schema definitions
 */

import { createHmac } from "node:crypto";

/* ------------------------------------------------------------------ */
/* 1. Mobile JWT Authentication Engine (HMAC SHA-256)                 */
/* ------------------------------------------------------------------ */

const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  "dev-local-jwt-secret-key-do-not-use-in-prod";

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  return Buffer.from(base64, "base64").toString("utf8");
}

export interface MobileJwtPayload {
  userId: number;
  email: string;
  role: string;
  brandSlug: string;
  exp: number;
}

export function signMobileJwt(payload: Omit<MobileJwtPayload, "exp">, expiresInSeconds = 86400 * 30): string {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const fullPayload: MobileJwtPayload = { ...payload, exp };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyMobileJwt(token: string): MobileJwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, signature] = parts;

    const expectedSig = createHmac("sha256", JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    if (signature !== expectedSig) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as MobileJwtPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function extractAuthToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 2. Pagination & Sorting Utilities                                  */
/* ------------------------------------------------------------------ */

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export function parsePagination(url: URL): PaginationParams {
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const offset = (page - 1) * limit;
  const sortBy = url.searchParams.get("sortBy") || "createdAt";
  const sortOrder = url.searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

  return { page, limit, offset, sortBy, sortOrder };
}

export interface PaginatedMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export function buildPaginatedEnvelope<T>(items: T[], total: number, page: number, limit: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  const meta: PaginatedMeta = {
    total,
    page,
    limit,
    totalPages,
    hasMore: page < totalPages,
  };
  return { ok: true, data: items, meta };
}

/* ------------------------------------------------------------------ */
/* 3. In-Memory Sliding Window Rate Limiter                           */
/* ------------------------------------------------------------------ */

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  identifier: string,
  limit = 120,
  windowMs = 60000,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(identifier);

  if (!bucket || bucket.resetAt < now) {
    rateLimitBuckets.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  return {
    allowed: bucket.count <= limit,
    remaining,
    resetAt: bucket.resetAt,
  };
}

/* ------------------------------------------------------------------ */
/* 4. OpenAPI 3.0.0 Schema Specification (Mobile v1 Complete)          */
/* ------------------------------------------------------------------ */

export const OPENAPI_SPEC = {
  openapi: "3.0.0",
  info: {
    title: "Nihongo Bridge Mobile REST API",
    version: "1.0.0",
    description: "Enterprise Mobile Backend for Flutter & Native iOS/Android apps (Nihongo Bridge). Supports JWT, Pagination, Sorting, Caching, and Rate Limiting.",
  },
  servers: [{ url: "/api/v1", description: "Production Mobile API v1" }],
  paths: {
    "/mobile/auth": {
      post: {
        summary: "Mobile JWT Authentication & Session Bootstrap",
        responses: { 200: { description: "JWT Token & User Profile" } },
      },
    },
    "/mobile/profile": {
      get: { summary: "Learner User Profile and Settings" },
    },
    "/mobile/vocabulary": {
      get: { summary: "Paginated Japanese Vocabulary Deck" },
    },
    "/mobile/kanji": {
      get: { summary: "Paginated Japanese Kanji Deck with stroke counts" },
    },
    "/mobile/decks": {
      get: { summary: "Quizlet-style Custom Flashcard Decks" },
    },
    "/mobile/reviews": {
      post: { summary: "Submit SM-2 Spaced Repetition Flashcard Review" },
    },
    "/mobile/quizzes": {
      get: { summary: "Interactive Quiz questions and answer options" },
    },
    "/mobile/mock-tests": {
      get: { summary: "JLPT Mock Exams (N5 to N1)" },
    },
    "/mobile/news": {
      get: { summary: "TODAI-style Japanese Daily News with furigana" },
    },
    "/mobile/progress": {
      get: { summary: "Learner XP, Streak Days, and Daily Goal Progress" },
    },
    "/mobile/achievements": {
      get: { summary: "Unlocked Badges and Milestones" },
    },
    "/mobile/notifications": {
      get: { summary: "User alerts and daily review reminders" },
    },
    "/mobile/downloads": {
      get: { summary: "Offline study PDFs and workbook files" },
    },
  },
};

/* ------------------------------------------------------------------ */
/* 5. Future GraphQL Compatibility Layer Schema                       */
/* ------------------------------------------------------------------ */

export const GRAPHQL_SCHEMA_DEF = `
  type Brand {
    id: ID!
    slug: String!
    name: String!
    tagline: String
  }
  type Course {
    id: ID!
    slug: String!
    title: String!
    summary: String
    level: String!
  }
  type NihongoItem {
    id: ID!
    category: String!
    jlptLevel: String
    japanese: String!
    meaning: String!
  }
  type Query {
    brands: [Brand!]!
    courses(brandSlug: String!, page: Int, limit: Int): [Course!]!
    nihongoItems(category: String, jlptLevel: String): [NihongoItem!]!
  }
`;
