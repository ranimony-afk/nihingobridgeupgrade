/**
 * Centralized Environment Configuration
 * -------------------------------------
 * Ensures all sensitive credentials and service endpoints are loaded strictly
 * from `process.env`. Hardcoded secrets are prohibited in production.
 */

export interface AppEnvironment {
  DATABASE_URL: string;
  NEXTAUTH_URL: string;
  NEXTAUTH_SECRET: string;
  JWT_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  NODE_ENV: string;
}

export const env: AppEnvironment = {
  DATABASE_URL: process.env.DATABASE_URL || "",
  NEXTAUTH_URL: process.env.NEXTAUTH_URL || "http://localhost:3000",
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "",
  JWT_SECRET: process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || "",
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  NODE_ENV: process.env.NODE_ENV || "development",
};

/**
 * Validates that critical production environment variables are present.
 * Should be called during server bootstrap or CI/CD pipelines.
 */
export function validateProductionEnv(): void {
  if (env.NODE_ENV === "production") {
    const requiredKeys: (keyof AppEnvironment)[] = [
      "DATABASE_URL",
      "NEXTAUTH_SECRET",
      "JWT_SECRET",
    ];

    const missing = requiredKeys.filter((key) => !env[key]);
    if (missing.length > 0) {
      throw new Error(`Production environment bootstrap failed. Missing required environment variables: ${missing.join(", ")}`);
    }
  }
}
