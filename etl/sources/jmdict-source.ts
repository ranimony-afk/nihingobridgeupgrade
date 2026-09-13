/**
 * Source acquisition stage: resolve the JMdict input and verify its integrity.
 *
 * Phase 04.2 policy: fixture-first. Network download is disabled unless
 * ETL_ALLOW_NETWORK=true, so the pipeline is reproducible and offline-safe.
 */

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { EtlConfig } from "../config";
import { isRetryableHttpStatus, withRetry } from "../runtime/retry";

export type SourceResolution = {
  path: string;
  bytes: number;
  sha256: string;
  checksumVerified: boolean;
  origin: "fixture" | "download" | "cache";
  url: string;
};

/** Stream a file through SHA-256 without buffering it in memory. */
export async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

class DownloadHttpError extends Error {
  constructor(readonly status: number, url: string) {
    super(`Download failed: HTTP ${status} for ${url}`);
    this.name = "DownloadHttpError";
  }
}

async function download(
  url: string,
  dest: string,
  timeoutMs: number,
  retries: number,
  backoffMs: number,
): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;

  await withRetry(
    async () => {
      // A stale partial must never be appended to a later retry.
      await rm(tmp, { force: true });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": "NihongoBridge-ETL/1.0" },
        });
        if (!res.ok) throw new DownloadHttpError(res.status, url);
        if (!res.body) throw new Error(`Download body missing for ${url}`);
        // Write to a temp file then rename — never expose partial content.
        await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
        const { rename } = await import("node:fs/promises");
        await rename(tmp, dest);
      } finally {
        clearTimeout(timer);
      }
    },
    {
      attempts: retries,
      baseDelayMs: backoffMs,
      shouldRetry: (error) =>
        error instanceof DownloadHttpError ? isRetryableHttpStatus(error.status) : true,
      onRetry: ({ error, attempt, delayMs }) => {
        console.warn(
          `[etl] download retry ${attempt}/${retries - 1} in ${delayMs}ms: ${String(error)}`,
        );
      },
    },
  ).finally(async () => {
    // `rename` removes tmp on success; failed attempts must not leak it.
    await rm(tmp, { force: true });
  });
}

export async function resolveSource(config: EtlConfig): Promise<SourceResolution> {
  let path: string;
  let origin: SourceResolution["origin"];

  if (!config.allowNetwork) {
    path = config.fixturePath;
    origin = "fixture";
    if (!(await fileExists(path))) {
      throw new Error(
        `Fixture not found at ${path}. Generate it with: npm run etl:fixture`,
      );
    }
  } else {
    path = `etl/data/raw/${config.downloadFilename}`;
    origin = (await fileExists(path)) ? "cache" : "download";
    if (origin === "download") {
      await download(
        config.jmdictUrl,
        path,
        config.httpTimeoutMs,
        config.downloadRetries,
        config.downloadBackoffMs,
      );
    }
  }

  const sha256 = await hashFile(path);
  const { size } = await stat(path);

  let checksumVerified = false;
  if (config.jmdictSha256) {
    if (config.jmdictSha256 !== sha256) {
      throw new Error(
        `Checksum mismatch for ${path}: expected ${config.jmdictSha256}, got ${sha256}`,
      );
    }
    checksumVerified = true;
  } else if (config.requireSourceChecksum) {
    throw new Error(
      "REQUIRE_SOURCE_CHECKSUM=true but no trusted JMDICT_SHA256 digest was provided",
    );
  }

  return {
    path,
    bytes: size,
    sha256,
    checksumVerified,
    origin,
    url: origin === "fixture" ? `file://${path}` : config.jmdictUrl,
  };
}
