/**
 * KanjiVG SVG Parser & Structural Validator — Phase 14.4D.
 *
 * High-performance, zero-dependency parser for KanjiVG stroke-order vector SVG data.
 * Extracts stroke paths, stroke sequences, radical groupings, subcomponents, and viewBox.
 *
 * Enforces strict SVG security rules: blocks executable code, scripts, foreign objects,
 * external network requests, and malicious payload patterns.
 */

export interface KanjiVgStroke {
  id: string; // e.g. "kvg:065e5-s1"
  order: number; // 1-based stroke sequence
  path: string; // SVG path data 'd'
  type?: string; // CJK stroke classification (e.g. "㇑", "㇕a")
}

export interface KanjiVgComponent {
  element: string; // Character or primitive element name
  position?: string | null; // "left", "right", "top", "bottom", etc.
  radical?: string | null; // "general", "tradit", "nelson", etc.
  part?: number | null;
  number?: number | null;
  strokes: number[]; // 1-based stroke orders included in this component
}

export interface KanjiVgParsedSvg {
  character: string;
  codepoint: string; // e.g. "065e5"
  unicode: string; // e.g. "U+65E5"
  viewBox: string; // standard "0 0 109 109"
  width: number;
  height: number;
  strokeCount: number;
  strokes: KanjiVgStroke[];
  components: KanjiVgComponent[];
  primaryRadical: {
    element: string;
    type: string;
    position?: string | null;
  } | null;
  variantType: string | null; // e.g. "Kaisho", "VtLst", null for standard
  rawSvg: string;
  isSafe: boolean;
  securityDiagnostics: string[];
}

/**
 * Validates SVG security to guarantee safe SSR and mobile rendering.
 */
export function validateSvgSecurity(svg: string): {
  isSafe: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // 1. Forbidden executable elements
  const forbiddenTags = [
    "<script",
    "</script",
    "<iframe",
    "<foreignObject",
    "<embed",
    "<object",
    "<audio",
    "<video",
    "<applet",
    "<meta",
    "<link",
  ];
  for (const tag of forbiddenTags) {
    if (svg.toLowerCase().includes(tag)) {
      errors.push(`Forbidden tag detected in SVG: ${tag}`);
    }
  }

  // 2. Event handler attributes
  const eventHandlerRegex = /\son[a-zA-Z]+\s*=/i;
  if (eventHandlerRegex.test(svg)) {
    errors.push("Forbidden inline event handler attribute detected in SVG");
  }

  // 3. Javascript URIs or base64 data URIs
  if (/javascript\s*:/i.test(svg)) {
    errors.push("Forbidden javascript: protocol detected in SVG");
  }
  if (/data\s*:\s*text\/html/i.test(svg)) {
    errors.push("Forbidden data:text/html protocol detected in SVG");
  }

  // 4. External network references in xlink:href or href
  const externalRefRegex = /(?:href|xlink:href)\s*=\s*["']https?:\/\//i;
  if (externalRefRegex.test(svg)) {
    errors.push("Forbidden external network reference in SVG href");
  }

  // 5. External CSS @import
  if (/@import\s+(?:url\()?["']?https?:/i.test(svg)) {
    errors.push("Forbidden external @import in SVG");
  }

  return {
    isSafe: errors.length === 0,
    errors,
  };
}

/**
 * Extracts attribute value from an XML tag string.
 */
function extractAttribute(tagStr: string, attrName: string): string | null {
  const regex = new RegExp(`\\b${attrName}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = tagStr.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Derives Unicode scalar and character from 5-digit hex codepoint (e.g. "065e5" -> "U+65E5", "日").
 */
export function codepointToCharacter(codepoint: string): {
  character: string;
  unicode: string;
  hex: string;
} {
  const hexPart = codepoint.replace(/^0+/, "") || "0";
  const code = parseInt(hexPart, 16);

  if (isNaN(code) || code <= 0) {
    return { character: "", unicode: "", hex: codepoint };
  }

  const character = String.fromCodePoint(code);
  const unicode = `U+${hexPart.toUpperCase().padStart(4, "0")}`;
  return { character, unicode, hex: hexPart.toLowerCase() };
}

/**
 * Parses a KanjiVG SVG file string into structured visual metadata.
 */
export function parseKanjiVgSvg(
  svgContent: string,
  fileNameHint?: string
): KanjiVgParsedSvg {
  // 1. Security check
  const security = validateSvgSecurity(svgContent);

  // 2. Extract SVG root attributes
  const svgOpenMatch = svgContent.match(/<svg\b([^>]*)>/i);
  const svgAttrs = svgOpenMatch ? svgOpenMatch[1] : "";

  const viewBox = extractAttribute(svgAttrs, "viewBox") || "0 0 109 109";
  const widthStr = extractAttribute(svgAttrs, "width") || "109";
  const heightStr = extractAttribute(svgAttrs, "height") || "109";
  const width = parseFloat(widthStr) || 109;
  const height = parseFloat(heightStr) || 109;

  // 3. Determine codepoint and variant from filename or root ID
  let codepoint = "";
  let variantType: string | null = null;

  if (fileNameHint) {
    const base = fileNameHint.replace(/\.svg$/i, "");
    const parts = base.split("-");
    codepoint = parts[0];
    if (parts.length > 1) {
      variantType = parts.slice(1).join("-");
    }
  }

  if (!codepoint) {
    const rootIdMatch = svgContent.match(/<g\b[^>]*\bid\s*=\s*["']kvg:([0-9a-fA-F]{4,5})(?:-([a-zA-Z][^"']*))?["']/);
    if (rootIdMatch) {
      codepoint = rootIdMatch[1];
      if (!variantType && rootIdMatch[2] && !/^s\d+$/i.test(rootIdMatch[2])) {
        variantType = rootIdMatch[2];
      }
    }
  }

  const { character, unicode } = codepointToCharacter(codepoint);

  // 4. Extract strokes
  const strokes: KanjiVgStroke[] = [];
  const pathRegex = /<path\b([^>]*)\/?>/gi;
  let pathMatch: RegExpExecArray | null;
  let strokeIndex = 1;

  while ((pathMatch = pathRegex.exec(svgContent)) !== null) {
    const pAttrs = pathMatch[1];
    const pathD = extractAttribute(pAttrs, "d");
    if (!pathD) continue;

    const strokeId = extractAttribute(pAttrs, "id") || `kvg:${codepoint}-s${strokeIndex}`;
    const strokeType = extractAttribute(pAttrs, "kvg:type") || undefined;

    strokes.push({
      id: strokeId,
      order: strokeIndex,
      path: pathD,
      type: strokeType,
    });

    strokeIndex++;
  }

  // 5. Extract components & radicals from <g> elements
  const components: KanjiVgComponent[] = [];
  let primaryRadical: KanjiVgParsedSvg["primaryRadical"] = null;

  const gRegex = /<g\b([^>]*)>/gi;
  let gMatch: RegExpExecArray | null;

  while ((gMatch = gRegex.exec(svgContent)) !== null) {
    const gAttrs = gMatch[1];
    const element = extractAttribute(gAttrs, "kvg:element");
    if (!element) continue;

    const position = extractAttribute(gAttrs, "kvg:position");
    const radical = extractAttribute(gAttrs, "kvg:radical");
    const partStr = extractAttribute(gAttrs, "kvg:part");
    const numStr = extractAttribute(gAttrs, "kvg:number");

    const part = partStr ? parseInt(partStr, 10) : null;
    const number = numStr ? parseInt(numStr, 10) : null;

    if (radical && !primaryRadical) {
      primaryRadical = {
        element,
        type: radical,
        position,
      };
    }

    components.push({
      element,
      position,
      radical,
      part,
      number,
      strokes: [], // stroke membership resolved during tree walks
    });
  }

  return {
    character,
    codepoint,
    unicode,
    viewBox,
    width,
    height,
    strokeCount: strokes.length,
    strokes,
    components,
    primaryRadical,
    variantType,
    rawSvg: svgContent,
    isSafe: security.isSafe,
    securityDiagnostics: security.errors,
  };
}
