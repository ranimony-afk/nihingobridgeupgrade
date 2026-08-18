import { z } from "zod";

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalUrl = z.preprocess(emptyStringToUndefined, z.string().url().optional());
const optionalSecret = z.preprocess(emptyStringToUndefined, z.string().min(1).optional());
const optionalStrongSecret = z.preprocess(emptyStringToUndefined, z.string().min(32).optional());
const optionalStateCode = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}$/).optional(),
);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url(),
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

    AUTH_SECRET: optionalStrongSecret,
    AUTH_TRUST_HOST: z.enum(["true", "false"]).default("false"),
    GITHUB_ID: optionalSecret,
    GITHUB_SECRET: optionalSecret,
    GOOGLE_ID: optionalSecret,
    GOOGLE_SECRET: optionalSecret,
    RESEND_API_KEY: optionalSecret,
    EMAIL_FROM: z.preprocess(emptyStringToUndefined, z.string().email().optional()),

    MOBILE_JWT_SECRET: optionalStrongSecret,
    MOBILE_JWT_ISSUER: z.string().url().default("http://localhost:3000"),
    MOBILE_JWT_AUDIENCE: z.string().min(1).default("nihongobridge-mobile"),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    AUTH_SESSION_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    MFA_ENCRYPTION_KEY: optionalStrongSecret,

    STRIPE_SECRET_KEY: optionalSecret,
    STRIPE_WEBHOOK_SECRET: optionalSecret,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalSecret,
    RAZORPAY_KEY_ID: optionalSecret,
    RAZORPAY_KEY_SECRET: optionalSecret,
    RAZORPAY_WEBHOOK_SECRET: optionalSecret,
    GST_DEFAULT_RATE_BPS: z.coerce.number().int().min(0).max(10_000).default(1_800),
    GST_SUPPLY_STATE: optionalStateCode,
    BILLING_LEGAL_NAME: z.preprocess(emptyStringToUndefined, z.string().trim().max(160).optional()),
    BILLING_GSTIN: z.preprocess(emptyStringToUndefined, z.string().trim().toUpperCase().max(32).optional()),

    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalSecret,
    SUPABASE_SERVICE_ROLE_KEY: optionalSecret,
    REDIS_URL: optionalUrl,
    RATE_LIMIT_ALLOW_MEMORY_FALLBACK: z.enum(["true", "false"]).default("true"),

    SENTRY_DSN: optionalUrl,
    NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
    SENTRY_AUTH_TOKEN: optionalSecret,
    SENTRY_ORG: optionalSecret,
    SENTRY_PROJECT: optionalSecret,

    HEALTHCHECK_TOKEN: optionalSecret,
    BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    BACKUP_ENCRYPTION_KEY: optionalSecret,
  })
  .superRefine((value, context) => {
    const pairs: Array<[keyof typeof value, keyof typeof value, string]> = [
      ["GITHUB_ID", "GITHUB_SECRET", "GITHUB_ID and GITHUB_SECRET must be configured together."],
      ["GOOGLE_ID", "GOOGLE_SECRET", "GOOGLE_ID and GOOGLE_SECRET must be configured together."],
      ["RESEND_API_KEY", "EMAIL_FROM", "RESEND_API_KEY and EMAIL_FROM must be configured together."],
      ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "Stripe requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET together."],
      ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "Razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET together."],
    ];

    for (const [firstKey, secondKey, message] of pairs) {
      if (Boolean(value[firstKey]) !== Boolean(value[secondKey])) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [secondKey], message });
      }
    }

    if (value.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && !value.STRIPE_SECRET_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STRIPE_SECRET_KEY"],
        message: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY requires STRIPE_SECRET_KEY.",
      });
    }

    const supabasePublicConfigured = Boolean(
      value.NEXT_PUBLIC_SUPABASE_URL || value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
    if (supabasePublicConfigured && !(value.NEXT_PUBLIC_SUPABASE_URL && value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
        message: "Supabase URL and publishable key must be configured together.",
      });
    }

    if (value.SUPABASE_SERVICE_ROLE_KEY && !value.NEXT_PUBLIC_SUPABASE_URL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SUPABASE_SERVICE_ROLE_KEY"],
        message: "SUPABASE_SERVICE_ROLE_KEY requires NEXT_PUBLIC_SUPABASE_URL.",
      });
    }
  });

const parsed = environmentSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  LOG_LEVEL: process.env.LOG_LEVEL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
  GITHUB_ID: process.env.GITHUB_ID,
  GITHUB_SECRET: process.env.GITHUB_SECRET,
  GOOGLE_ID: process.env.GOOGLE_ID,
  GOOGLE_SECRET: process.env.GOOGLE_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  MOBILE_JWT_SECRET: process.env.MOBILE_JWT_SECRET,
  MOBILE_JWT_ISSUER: process.env.MOBILE_JWT_ISSUER ?? process.env.NEXT_PUBLIC_APP_URL,
  MOBILE_JWT_AUDIENCE: process.env.MOBILE_JWT_AUDIENCE,
  ACCESS_TOKEN_TTL_SECONDS: process.env.ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_DAYS: process.env.REFRESH_TOKEN_TTL_DAYS,
  AUTH_SESSION_MAX_AGE_DAYS: process.env.AUTH_SESSION_MAX_AGE_DAYS,
  MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
  GST_DEFAULT_RATE_BPS: process.env.GST_DEFAULT_RATE_BPS,
  GST_SUPPLY_STATE: process.env.GST_SUPPLY_STATE,
  BILLING_LEGAL_NAME: process.env.BILLING_LEGAL_NAME,
  BILLING_GSTIN: process.env.BILLING_GSTIN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  REDIS_URL: process.env.REDIS_URL,
  RATE_LIMIT_ALLOW_MEMORY_FALLBACK: process.env.RATE_LIMIT_ALLOW_MEMORY_FALLBACK,
  SENTRY_DSN: process.env.SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  SENTRY_ORG: process.env.SENTRY_ORG,
  SENTRY_PROJECT: process.env.SENTRY_PROJECT,
  HEALTHCHECK_TOKEN: process.env.HEALTHCHECK_TOKEN,
  BACKUP_RETENTION_DAYS: process.env.BACKUP_RETENTION_DAYS,
  BACKUP_ENCRYPTION_KEY: process.env.BACKUP_ENCRYPTION_KEY,
});

if (!parsed.success) {
  throw new Error(
    `Invalid runtime environment: ${parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")}`,
  );
}

export const env = parsed.data;

export type EnvironmentFeature =
  | "auth"
  | "githubOAuth"
  | "googleOAuth"
  | "email"
  | "mobileJwt"
  | "mfa"
  | "stripe"
  | "razorpay"
  | "supabase"
  | "supabaseAdmin"
  | "redis"
  | "sentry";

export function isFeatureConfigured(feature: EnvironmentFeature): boolean {
  switch (feature) {
    case "auth":
      return Boolean(env.AUTH_SECRET);
    case "githubOAuth":
      return Boolean(env.GITHUB_ID && env.GITHUB_SECRET);
    case "googleOAuth":
      return Boolean(env.GOOGLE_ID && env.GOOGLE_SECRET);
    case "email":
      return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
    case "mobileJwt":
      return Boolean(env.MOBILE_JWT_SECRET);
    case "mfa":
      return Boolean(env.MFA_ENCRYPTION_KEY || env.AUTH_SECRET);
    case "stripe":
      return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
    case "razorpay":
      return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET);
    case "supabase":
      return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    case "supabaseAdmin":
      return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
    case "redis":
      return Boolean(env.REDIS_URL);
    case "sentry":
      return Boolean(env.SENTRY_DSN || env.NEXT_PUBLIC_SENTRY_DSN);
  }
}

export function productionReadinessIssues(): string[] {
  if (env.NODE_ENV !== "production") return [];

  const requirements: Array<[EnvironmentFeature, string]> = [
    ["auth", "Auth.js requires AUTH_SECRET."],
    ["githubOAuth", "GitHub OAuth requires GITHUB_ID and GITHUB_SECRET."],
    ["googleOAuth", "Google OAuth requires GOOGLE_ID and GOOGLE_SECRET."],
    ["email", "Email login requires RESEND_API_KEY and EMAIL_FROM."],
    ["mobileJwt", "Flutter token issuance requires MOBILE_JWT_SECRET."],
    ["mfa", "Two-factor authentication requires MFA_ENCRYPTION_KEY or AUTH_SECRET."],
    ["stripe", "Stripe payments require STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET."],
    ["razorpay", "Razorpay payments require RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET."],
    ["supabase", "Supabase requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."],
    ["supabaseAdmin", "Supabase server operations require SUPABASE_SERVICE_ROLE_KEY."],
    ["redis", "Redis rate limiting requires REDIS_URL."],
    ["sentry", "Error tracking requires SENTRY_DSN or NEXT_PUBLIC_SENTRY_DSN."],
  ];

  return requirements
    .filter(([feature]) => !isFeatureConfigured(feature))
    .map(([, message]) => message);
}

export function assertProductionInfrastructure(): void {
  const issues = productionReadinessIssues();
  if (issues.length > 0) {
    throw new Error(`Production infrastructure is incomplete: ${issues.join(" ")}`);
  }
}
