import * as Sentry from "@sentry/nextjs";
import { env, isFeatureConfigured } from "@/lib/env";
import { logError, logger } from "@/lib/logger";

type ErrorContext = Record<string, unknown>;

export function reportException(
  error: unknown,
  context: ErrorContext = {},
  message = "Unhandled application exception",
): void {
  logError(message, error, context);

  if (isFeatureConfigured("sentry")) {
    Sentry.withScope((scope) => {
      scope.setTags({ environment: env.NODE_ENV, ...stringifyTags(context) });
      Sentry.captureException(error);
    });
  }
}

export function reportMessage(message: string, context: ErrorContext = {}): void {
  logger.warn(context, message);

  if (isFeatureConfigured("sentry")) {
    Sentry.captureMessage(message, "warning");
  }
}

function stringifyTags(context: ErrorContext): Record<string, string> {
  return Object.fromEntries(
    Object.entries(context)
      .filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      .map(([key, value]) => [key, String(value)]),
  );
}
