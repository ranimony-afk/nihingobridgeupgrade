import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Downloads `url` (http/https/ftp) into `dest` unless `dest` already exists. */
export function download(url, dest) {
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    return { path: dest, cached: true };
  }
  execFileSync(
    "curl",
    ["-sS", "-L", "--fail", "--retry", "2", "--max-time", "900", "-o", dest, url],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  return { path: dest, cached: false };
}

export function sha256File(file) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

/** Decodes a (possibly gzipped) file to text. `encoding` is any ICU label. */
export function decodeFile(file, encoding = "utf-8") {
  const buffer = fs.readFileSync(file);
  const raw = file.endsWith(".gz") ? zlib.gunzipSync(buffer) : buffer;
  if (encoding === "utf-8") return raw.toString("utf8");
  return new TextDecoder(encoding).decode(raw);
}

/** Async line iterator over a (possibly gzipped) text file. */
export function* iterateLines(file, encoding = "utf-8") {
  const text = decodeFile(file, encoding);
  let start = 0;
  while (start < text.length) {
    const index = text.indexOf("\n", start);
    if (index === -1) {
      yield text.slice(start);
      return;
    }
    const line = text.slice(start, index);
    start = index + 1;
    yield line.endsWith("\r") ? line.slice(0, -1) : line;
  }
}

/**
 * Low-memory streaming line iterator for UTF-8 (optionally gzipped) files.
 * Used for the large KANJIDIC2 / JMdict inputs.
 */
export async function* streamLines(file) {
  const input = fs.createReadStream(file);
  const stream = file.endsWith(".gz") ? input.pipe(zlib.createGunzip()) : input;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    yield line;
  }
}

export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

/** Collects every `new TextDecoder(...)`-decoded XML element body for a tag. */
export function matchAll(text, regex) {
  return Array.from(text.matchAll(regex)).map((match) => match[1]);
}
