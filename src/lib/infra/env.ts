import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal("").transform(() => undefined));

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16).optional(),
  AUTH_TRUST_HOST: z.string().optional(),
  REDIS_URL: optionalUrl,
  SUPABASE_URL: optionalUrl,
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SENTRY_DSN: optionalUrl,
  ERROR_WEBHOOK_URL: optionalUrl,
  ADMIN_BOOTSTRAP_PASSWORD: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().optional(),
  NEXT_PUBLIC_APP_URL: optionalUrl,
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  BACKUP_DIR: z.string().default("backups"),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function parseEnv(raw: Record<string, string | undefined>) {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}

let cached: AppEnv | null = null;

export function getEnv() {
  if (!cached) {
    cached = parseEnv(process.env);
  }
  return cached;
}

export function resetEnvCache() {
  cached = null;
}

export function hasOptionalService(env: AppEnv, name: "redis" | "supabase" | "sentry") {
  if (name === "redis") return Boolean(env.REDIS_URL);
  if (name === "supabase") return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY);
  return Boolean(env.SENTRY_DSN);
}

export function authSecret(env: AppEnv = getEnv()) {
  if (env.AUTH_SECRET) return env.AUTH_SECRET;
  return `local-${env.DATABASE_URL.slice(0, 24)}`.padEnd(32, "x");
}
