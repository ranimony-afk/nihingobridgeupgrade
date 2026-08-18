import pino, { type Logger } from "pino";
import { env } from "@/lib/env";

type LogContext = Record<string, unknown>;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: env.NODE_ENV === "production" ? undefined : error.stack,
    };
  }

  return { message: String(error) };
}

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: "nihongobridge-web",
    environment: env.NODE_ENV,
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  redact: {
    paths: [
      "authorization",
      "cookie",
      "headers.authorization",
      "headers.cookie",
      "password",
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
      "secret",
    ],
    censor: "[REDACTED]",
  },
});

export function logError(message: string, error: unknown, context: LogContext = {}): void {
  logger.error({ ...context, err: serializeError(error) }, message);
}

export function requestContext(request: Request): LogContext {
  return {
    method: request.method,
    pathname: new URL(request.url).pathname,
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
  };
}
