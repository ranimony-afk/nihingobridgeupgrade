import path from "node:path";

import { decodeFile, download, sha256File } from "../lib/util.mjs";

/**
 * Canonical upstream dataset registry.
 *
 * Licence notes (see docs/PROVENANCE.md):
 *  - KANJIDIC2 : Electronic Dictionary Research and Development Group (EDRDG),
 *                released under Creative Commons Attribution-ShareAlike 4.0.
 *  - KRADFILE / RADKFILE : EDRDG Licence (http://www.edrdg.org/edrdg/licence.html).
 *  - JMdict (English subset) : EDRDG, same licence family as KANJIDIC2.
 *
 * No proprietary dictionary (Takoboto, WaniKani, ...), no scraping.
 */
export const DATA_DIR = path.join(process.cwd(), "etl", "data");

export const SOURCES = [
  {
    code: "kanjidic2",
    name: "KANJIDIC2",
    file: "kanjidic2.xml.gz",
    urls: [
      "https://www.edrdg.org/kanjidic/kanjidic2.xml.gz",
      "ftp://ftp.edrdg.org/pub/Nihongo/kanjidic2.xml.gz",
    ],
    license: "CC BY-SA 4.0 (EDRDG)",
    licenseUrl: "https://www.edrdg.org/edrdg/licence.html",
    sourceUrl: "http://www.edrdg.org/wiki/index.php/KANJIDIC_Project",
    encoding: "utf-8",
  },
  {
    code: "radkfile",
    name: "RADKFILE (radical -> kanji index)",
    file: "radkfile.euc.gz",
    urls: ["ftp://ftp.edrdg.org/pub/Nihongo/radkfile.gz"],
    license: "EDRDG Licence",
    licenseUrl: "http://www.edrdg.org/edrdg/licence.html",
    sourceUrl: "http://www.edrdg.org/krad/kradinf.html",
    encoding: "euc-jp",
  },
  {
    code: "kradfile",
    name: "KRADFILE (kanji -> component decomposition)",
    file: "kradfile.euc.gz",
    urls: ["ftp://ftp.edrdg.org/pub/Nihongo/kradfile.gz"],
    license: "EDRDG Licence",
    licenseUrl: "http://www.edrdg.org/edrdg/licence.html",
    sourceUrl: "http://www.edrdg.org/krad/kradinf.html",
    encoding: "euc-jp",
  },
  {
    code: "tanaka",
    name: "Tanaka corpus (Japanese-English example sentences)",
    file: "examples.utf.gz",
    urls: ["ftp://ftp.edrdg.org/pub/Nihongo/examples.utf.gz"],
    license: "EDRDG Licence",
    licenseUrl: "http://www.edrdg.org/edrdg/licence.html",
    sourceUrl: "http://www.edrdg.org/examples.html",
    encoding: "utf-8",
  },
  {
    code: "grammar-seed",
    name: "NihongoBridge curated grammar points",
    file: "grammar-points.json",
    urls: [],
    license: "CC BY-SA 4.0 (NihongoBridge)",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://github.com/ranimony-afk/nihingobridgeupgrade",
    encoding: "utf-8",
  },
  {
    code: "grammar-structures",
    name: "NihongoBridge grammar structure slots",
    file: "grammar-structures.json",
    urls: [],
    license: "CC BY-SA 4.0 (NihongoBridge)",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://github.com/ranimony-afk/nihingobridgeupgrade",
    encoding: "utf-8",
  },
  {
    code: "grammar-mistakes",
    name: "NihongoBridge curated common mistakes",
    file: "grammar-mistakes.json",
    urls: [],
    license: "CC BY-SA 4.0 (NihongoBridge)",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://github.com/ranimony-afk/nihingobridgeupgrade",
    encoding: "utf-8",
  },
  {
    code: "learning-seed",
    name: "NihongoBridge curated learning catalogue",
    file: "learning-catalog.json",
    urls: [],
    license: "CC BY-SA 4.0 (NihongoBridge)",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://github.com/ranimony-afk/nihingobridgeupgrade",
    encoding: "utf-8",
  },
  {
    code: "lesson-architecture",
    name: "NihongoBridge lesson architecture",
    file: "lesson-architecture.json",
    urls: [],
    license: "CC BY-SA 4.0 (NihongoBridge)",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://github.com/ranimony-afk/nihingobridgeupgrade",
    encoding: "utf-8",
  },
  {
    code: "course-architecture",
    name: "NihongoBridge course architecture",
    file: "course-architecture.json",
    urls: [],
    license: "CC BY-SA 4.0 (NihongoBridge)",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://github.com/ranimony-afk/nihingobridgeupgrade",
    encoding: "utf-8",
  },
  {
    code: "jlpt-blueprints",
    name: "NihongoBridge JLPT test blueprints",
    file: "jlpt-blueprints.json",
    urls: [],
    license: "CC BY-SA 4.0 (NihongoBridge)",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    sourceUrl: "https://github.com/ranimony-afk/nihingobridgeupgrade",
    encoding: "utf-8",
  },
  {
    code: "jmdict",
    name: "JMdict (English subset)",
    file: "JMdict_e.gz",
    urls: ["ftp://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz"],
    license: "EDRDG Licence (JMdict/EDICT)",
    licenseUrl: "http://www.edrdg.org/edrdg/licence.html",
    sourceUrl: "http://www.edrdg.org/jmdict/edict_doc.html",
    encoding: "utf-8",
  },
];

/** Materialises every source file into etl/data (cached) and fingerprints it. */
export function ensureSources(codes = SOURCES.map((source) => source.code)) {
  const resolved = [];
  for (const source of SOURCES) {
    if (!codes.includes(source.code)) continue;
    const target = path.join(DATA_DIR, source.file);
    if (source.urls.length === 0) {
      // Project-authored content: no download, the file ships with the repo.
      resolved.push({
        ...source,
        path: target,
        checksum: sha256File(target),
        version: null,
      });
      continue;
    }
    let lastError = null;
    for (const url of source.urls) {
      try {
        download(url, target);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) {
      throw new Error(
        `Unable to download ${source.code} from any mirror: ${lastError.message ?? lastError}`,
      );
    }
    resolved.push({
      ...source,
      path: target,
      checksum: sha256File(target),
      version: readVersion(source, target),
    });
  }
  return resolved;
}

function readVersion(source, file) {
  if (source.code === "kanjidic2") {
    const head = decodeFile(file, "utf-8").slice(0, 200_000);
    const match = head.match(/<database_version>([^<]+)<\/database_version>/);
    return match ? match[1] : null;
  }
  if (source.code === "jmdict") {
    const head = decodeFile(file, "utf-8").slice(0, 200_000);
    const match = head.match(/JMdict created: ([^<\n]+)/) ?? head.match(/<!-- Rev ([^-]+)/);
    return match ? match[1].trim() : null;
  }
  return null;
}
