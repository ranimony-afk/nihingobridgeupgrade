/**
 * Bounded retry utility for transient ETL source failures.
 *
 * Retry policy is explicit, finite, and observable. Callers may provide an
 * `onRetry` hook for logs/metrics; errors retain their final cause.
 */

export type RetryOptions = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (input: { error: unknown; attempt: number; delayMs: number }) => void;
  sleep?: (delayMs: number) => Promise<void>;
};

const defaultSleep = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs));

export class RetryExhaustedError extends Error {
  readonly causeError: unknown;
  readonly attempts: number;

  constructor(message: string, causeError: unknown, attempts: number) {
    super(message);
    this.name = "RetryExhaustedError";
    this.causeError = causeError;
    this.attempts = attempts;
  }
}

/** Execute a potentially transient operation with capped exponential backoff. */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  if (!Number.isInteger(options.attempts) || options.attempts < 1) {
    throw new Error("retry attempts must be an integer of at least 1");
  }
  if (!Number.isFinite(options.baseDelayMs) || options.baseDelayMs < 0) {
    throw new Error("retry baseDelayMs must be zero or greater");
  }

  const sleep = options.sleep ?? defaultSleep;
  const maxDelay = options.maxDelayMs ?? 30_000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = options.shouldRetry?.(error, attempt) ?? true;
      if (attempt === options.attempts || !retryable) break;

      const delayMs = Math.min(maxDelay, options.baseDelayMs * 2 ** (attempt - 1));
      options.onRetry?.({ error, attempt, delayMs });
      await sleep(delayMs);
    }
  }

  throw new RetryExhaustedError(
    `ETL source operation failed after ${options.attempts} attempt${options.attempts === 1 ? "" : "s"}`,
    lastError,
    options.attempts,
  );
}

/** HTTP status classification used by the source downloader. */
export function isRetryableHttpStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}
