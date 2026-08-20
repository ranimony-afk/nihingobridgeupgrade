/**
 * Source file downloader with retry, checksum verification, and caching.
 * Adapted from Repo B's etl/utils/downloader.py.
 */

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { loadConfig } from "../config";

export interface DownloadResult {
  filePath: string;
  cached: boolean;
  bytes: number;
  sha256: string;
}

/**
 * Download a source file if not already cached locally.
 * Returns the local file path.
 */
export async function downloadSource(
  url: string,
  filename: string,
  opts?: { expectedSha256?: string; forceRefresh?: boolean },
): Promise<DownloadResult> {
  const config = loadConfig();
  const rawDir = path.join(config.dataDir, "raw");
  fs.mkdirSync(rawDir, { recursive: true });

  const filePath = path.join(rawDir, filename);

  // Check cache
  if (!opts?.forceRefresh && fs.existsSync(filePath)) {
    const sha256 = await fileHash(filePath);
    if (!opts?.expectedSha256 || sha256 === opts.expectedSha256) {
      const stat = fs.statSync(filePath);
      return { filePath, cached: true, bytes: stat.size, sha256 };
    }
  }

  // Download with retry
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= config.downloadRetries; attempt++) {
    try {
      console.log(
        `[download] ${filename} attempt ${attempt}/${config.downloadRetries}`,
      );
      const response = await fetch(url, {
        headers: { "User-Agent": config.userAgent },
        signal: AbortSignal.timeout(config.httpTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const dest = fs.createWriteStream(filePath);
      // @ts-expect-error - ReadableStream → NodeJS.ReadableStream bridge
      await pipeline(response.body, dest);

      const stat = fs.statSync(filePath);
      const sha256 = await fileHash(filePath);

      if (opts?.expectedSha256 && sha256 !== opts.expectedSha256) {
        throw new Error(
          `Checksum mismatch: expected ${opts.expectedSha256}, got ${sha256}`,
        );
      }

      console.log(
        `[download] ${filename}: ${stat.size} bytes, sha256=${sha256.slice(0, 12)}…`,
      );
      return { filePath, cached: false, bytes: stat.size, sha256 };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < config.downloadRetries) {
        const backoff = config.downloadBackoffMs * Math.pow(2, attempt - 1);
        console.warn(
          `[download] ${filename} attempt ${attempt} failed: ${lastError.message}. Retrying in ${backoff}ms…`,
        );
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  throw new Error(
    `Failed to download ${filename} after ${config.downloadRetries} attempts: ${lastError?.message}`,
  );
}

async function fileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}
