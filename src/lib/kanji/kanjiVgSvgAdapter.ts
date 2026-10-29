import {
  STRUCTURAL_CANONICALIZATION_VERSION,
  STRUCTURAL_GRAPH_CONTRACT_VERSION,
  deriveStructuralRelationId,
  validateStructuralEvidenceGraph,
  type ExpectedStructuralProvenance,
  type StructuralEvidenceGraph,
} from "./structuralEvidenceGraph";

export const KANJIVG_SOURCE_REF = "https://github.com/KanjiVG/kanjivg";
export const KANJIVG_SOURCE_VERSION = "r20240807@a4b51d966d832544c371d566f9c84174e4beff3b";
export const KANJIVG_ARCHIVE_SHA256 = "a0cbc5c950d5c68bf3b6b24468ebdb8a829e62f04a4f44e1c7e98bade2597dcd";
export const KANJIVG_LICENSE = "CC-BY-SA-3.0";
export const KANJIVG_ATTRIBUTION =
  "KanjiVG; copyright Ulrich Apel; adapted from the r20240807 release. https://kanjivg.tagaini.net/";
export const KANJIVG_TRANSFORMATION_VERSION = "nihongobridge-kanjivg-svg-adapter@1";

const MAX_SVG_BYTES = 1_000_000;
const MAX_GROUPS = 2_000;
const MAX_PATHS = 512;
const MAX_PATH_DATA_LENGTH = 20_000;

export interface KanjiVgSvgPath {
  sourcePathId: string;
  pathData: string;
  strokeType: string | null;
  componentOccurrenceId: string | null;
}

export interface KanjiVgSourceGroup {
  sourceGroupId: string;
  parentSourceGroupId: string | null;
  element: string | null;
  position: string | null;
  radicalMarker: string | null;
  phoneticMarker: string | null;
  occurrenceId: string | null;
  parentOccurrenceId: string | null;
}

export interface KanjiVgGlyphRecord {
  character: string;
  sourceFile: string;
  sourceFileSha256: string;
  rootGroupId: string;
  viewBox: string;
  sourceStrokeWidth: number;
  paths: KanjiVgSvgPath[];
  groups: KanjiVgSourceGroup[];
  graph: StructuralEvidenceGraph;
}

export type KanjiVgSliceRecord = KanjiVgGlyphRecord & {
  graphCanonicalSha256: string;
};

export interface KanjiVgSliceArtifact {
  artifactVersion: "nihongobridge-kanjivg-slice@1";
  source: {
    sourceRef: typeof KANJIVG_SOURCE_REF;
    sourceVersion: typeof KANJIVG_SOURCE_VERSION;
    archiveSha256: typeof KANJIVG_ARCHIVE_SHA256;
    license: typeof KANJIVG_LICENSE;
    attribution: typeof KANJIVG_ATTRIBUTION;
  };
  transformationVersion: typeof KANJIVG_TRANSFORMATION_VERSION;
  generatedAt: "reproducible";
  records: KanjiVgSliceRecord[];
}

interface ParsedTag {
  name: string;
  attributes: Record<string, string>;
  closing: boolean;
  selfClosing: boolean;
  end: number;
}

interface GroupFrame {
  sourceGroupId: string;
  element: string | null;
  occurrenceId: string | null;
  parentOccurrenceId: string | null;
  isGlyphRoot: boolean;
}

function fail(message: string): never {
  throw new Error(`KanjiVG adapter: ${message}`);
}

function isUnicodeScalar(value: string): boolean {
  const points = Array.from(value);
  if (points.length !== 1) return false;
  const point = points[0].codePointAt(0);
  return point !== undefined && !(point >= 0xd800 && point <= 0xdfff);
}

function decodeXmlAttribute(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&apos;": "'",
    };
    const replacement = named[entity.toLowerCase()];
    if (replacement !== undefined) return replacement;
    const numeric = entity.match(/^&#(x[\da-f]+|\d+);$/i);
    if (!numeric) fail("unsupported XML entity in attribute");
    const codePoint = numeric[1].toLowerCase().startsWith("x")
      ? Number.parseInt(numeric[1].slice(1), 16)
      : Number.parseInt(numeric[1], 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      fail("invalid numeric XML entity in attribute");
    }
    return String.fromCodePoint(codePoint);
  }).replace(/&[^;\s]+;/g, () => fail("unsupported XML entity in attribute"));
}

function readTagEnd(text: string, start: number): number {
  let quote: "'" | '"' | null = null;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === ">") {
      return index + 1;
    }
  }
  return -1;
}

function parseTag(raw: string, end: number): ParsedTag {
  let cursor = 1;
  let closing = false;
  if (raw[cursor] === "/") {
    closing = true;
    cursor += 1;
  }
  while (/\s/.test(raw[cursor] ?? "")) cursor += 1;
  const nameStart = cursor;
  while (/[A-Za-z0-9_:.-]/.test(raw[cursor] ?? "")) cursor += 1;
  const name = raw.slice(nameStart, cursor);
  if (!name) fail("empty XML tag name");
  const attributes: Record<string, string> = Object.create(null) as Record<string, string>;
  let selfClosing = false;

  while (cursor < raw.length - 1) {
    while (/\s/.test(raw[cursor] ?? "")) cursor += 1;
    if (cursor >= raw.length - 1 || raw[cursor] === ">") break;
    if (raw[cursor] === "/") {
      selfClosing = true;
      cursor += 1;
      while (/\s/.test(raw[cursor] ?? "")) cursor += 1;
      if (raw[cursor] !== ">") fail("malformed self-closing tag");
      break;
    }
    const keyStart = cursor;
    while (/[A-Za-z0-9_:.-]/.test(raw[cursor] ?? "")) cursor += 1;
    const key = raw.slice(keyStart, cursor);
    if (!key) fail("malformed XML attribute name");
    while (/\s/.test(raw[cursor] ?? "")) cursor += 1;
    if (raw[cursor] !== "=") fail("XML attributes must have explicit values");
    cursor += 1;
    while (/\s/.test(raw[cursor] ?? "")) cursor += 1;
    const quote = raw[cursor];
    if (quote !== "'" && quote !== '"') fail("XML attribute values must be quoted");
    cursor += 1;
    const valueStart = cursor;
    while (cursor < raw.length - 1 && raw[cursor] !== quote) cursor += 1;
    if (raw[cursor] !== quote) fail("unterminated XML attribute");
    if (Object.prototype.hasOwnProperty.call(attributes, key)) fail(`duplicate XML attribute ${key}`);
    attributes[key] = decodeXmlAttribute(raw.slice(valueStart, cursor));
    cursor += 1;
  }

  if (closing && (selfClosing || Object.keys(attributes).length > 0)) fail("malformed closing tag");
  return { name, attributes, closing, selfClosing, end };
}

function readFirstTag(text: string, name: string): ParsedTag {
  const start = text.indexOf(`<${name}`);
  if (start < 0) fail(`missing <${name}> tag`);
  const next = text[start + name.length + 1];
  if (next !== ">" && !/\s/.test(next ?? "")) fail(`invalid <${name}> tag`);
  const end = readTagEnd(text, start);
  if (end < 0) fail(`unterminated <${name}> tag`);
  return parseTag(text.slice(start, end), end);
}

function styleMap(style: string | undefined): Map<string, string> {
  const values = new Map<string, string>();
  if (!style) return values;
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon <= 0) continue;
    const name = declaration.slice(0, colon).trim().toLowerCase();
    const value = declaration.slice(colon + 1).trim();
    if (name && value) values.set(name, value);
  }
  return values;
}

function readStrokeWidth(style: string | undefined): number {
  const candidate = styleMap(style).get("stroke-width") ?? "3";
  const width = Number.parseFloat(candidate);
  if (!Number.isFinite(width) || width <= 0 || width > 12) fail("source stroke width is outside the accepted range");
  return width;
}

function codePointHex(character: string): string {
  return character.codePointAt(0)!.toString(16).padStart(5, "0");
}

function encoded(value: string): string {
  return encodeURIComponent(value).replace(/%/g, "_");
}

function occurrenceNodeId(character: string, sourceGroupId: string): string {
  return `occurrence:${codePointHex(character)}:${encoded(sourceGroupId)}`;
}

function componentNodeId(character: string, identity: string): string {
  return `component:${codePointHex(character)}:${encoded(identity)}`;
}

function componentIdentity(element: string): string {
  return `kanjivg:kvg:element:${element}`;
}

function graphFromGroups(
  character: string,
  groups: KanjiVgSourceGroup[],
  digest: string,
): StructuralEvidenceGraph {
  const glyphId = `glyph:${codePointHex(character)}`;
  const nodes: StructuralEvidenceGraph["nodes"] = [
    { id: glyphId, kind: "glyph", character },
  ];
  const edges: StructuralEvidenceGraph["edges"] = [];
  const components = new Map<string, string>();

  for (const group of groups) {
    if (!group.occurrenceId || !group.element) continue;
    const identity = componentIdentity(group.element);
    let componentId = components.get(identity);
    if (!componentId) {
      componentId = componentNodeId(character, identity);
      components.set(identity, componentId);
      nodes.push({
        id: componentId,
        kind: "component",
        identity,
        character: isUnicodeScalar(group.element) ? group.element : null,
      });
    }
    const occurrenceId = group.occurrenceId;
    nodes.push({
      id: occurrenceId,
      kind: "occurrence",
      glyphId,
      componentId,
      renderedAs: group.element,
      position: group.position,
      orderIndex: nodes.filter((node) => node.kind === "occurrence").length,
    });
    const parentId = group.parentOccurrenceId ?? glyphId;
    edges.push(
      { id: deriveStructuralRelationId("contains", parentId, occurrenceId), type: "contains", from: parentId, to: occurrenceId },
      { id: deriveStructuralRelationId("instance_of", occurrenceId, componentId), type: "instance_of", from: occurrenceId, to: componentId },
    );
  }

  return {
    contractVersion: STRUCTURAL_GRAPH_CONTRACT_VERSION,
    canonicalizationVersion: STRUCTURAL_CANONICALIZATION_VERSION,
    transformationVersion: KANJIVG_TRANSFORMATION_VERSION,
    provenance: {
      sourceRef: KANJIVG_SOURCE_REF,
      sourceVersion: KANJIVG_SOURCE_VERSION,
      declaredContentDigest: digest,
      license: KANJIVG_LICENSE,
      attribution: KANJIVG_ATTRIBUTION,
    },
    nodes,
    edges,
  };
}

function ensureSha256(digest: string): void {
  if (!/^[0-9a-f]{64}$/.test(digest)) fail("source file SHA-256 must be lowercase hexadecimal");
}

/**
 * Parse the intentionally narrow KanjiVG stroke-path subset used by the product.
 * This is not a general-purpose XML/SVG parser. It ignores the pre-root XML/DTD,
 * rejects unsafe tag structure, and never returns executable markup.
 */
export function parseKanjiVgSvg(input: {
  character: string;
  sourceFile: string;
  sourceFileSha256: string;
  svgText: string;
}): KanjiVgGlyphRecord {
  const { character, sourceFile, sourceFileSha256: digest, svgText } = input;
  if (!isUnicodeScalar(character)) fail("character must be exactly one Unicode scalar");
  if (!/^kanji\/[0-9a-f]{5,6}\.svg$/.test(sourceFile)) fail("source filename must be an exact KanjiVG primary SVG path");
  ensureSha256(digest);
  if (svgText.length === 0 || svgText.length > MAX_SVG_BYTES) fail("source SVG exceeds the accepted size bounds");

  const rootStart = svgText.indexOf("<svg");
  if (rootStart < 0 || !/\s|>/.test(svgText[rootStart + 4] ?? "")) fail("missing SVG root");
  const svgEnd = readTagEnd(svgText, rootStart);
  if (svgEnd < 0) fail("unterminated SVG root");
  const svgTag = parseTag(svgText.slice(rootStart, svgEnd), svgEnd);
  const viewBox = svgTag.attributes.viewBox;
  if (!viewBox || !/^-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?){3}$/.test(viewBox)) fail("SVG viewBox is missing or invalid");

  const pathCodePoint = Number.parseInt(sourceFile.slice("kanji/".length, -".svg".length), 16);
  if (pathCodePoint !== character.codePointAt(0)) fail("source filename code point does not match the requested glyph");

  const content = svgText.slice(svgEnd);
  let cursor = 0;
  let inStrokePaths = false;
  let strokePathsDepth = 0;
  let rootGroupId = "";
  let glyphRootFound = false;
  let strokeWidth = 3;
  const stack: GroupFrame[] = [];
  const groups: KanjiVgSourceGroup[] = [];
  const paths: KanjiVgSvgPath[] = [];
  const seenGroupIds = new Set<string>();
  const seenPathIds = new Set<string>();
  let finishedStrokePaths = false;

  while (cursor < content.length && !finishedStrokePaths) {
    const tagStart = content.indexOf("<", cursor);
    if (tagStart < 0) break;
    if (content.startsWith("<!--", tagStart)) {
      const commentEnd = content.indexOf("-->", tagStart + 4);
      if (commentEnd < 0) fail("unterminated XML comment");
      cursor = commentEnd + 3;
      continue;
    }
    if (content.startsWith("<?", tagStart) || content.startsWith("<!", tagStart)) {
      const declarationEnd = readTagEnd(content, tagStart);
      if (declarationEnd < 0) fail("unterminated XML declaration");
      cursor = declarationEnd;
      continue;
    }
    const tagEnd = readTagEnd(content, tagStart);
    if (tagEnd < 0) fail("unterminated SVG tag");
    const tag = parseTag(content.slice(tagStart, tagEnd), tagEnd);
    cursor = tagEnd;

    if (!inStrokePaths) {
      if (!tag.closing && tag.name === "g" && (tag.attributes.id ?? "").startsWith("kvg:StrokePaths_")) {
        if (tag.selfClosing) fail("stroke path container must not be self-closing");
        inStrokePaths = true;
        strokePathsDepth = 1;
        strokeWidth = readStrokeWidth(tag.attributes.style);
      }
      continue;
    }

    if (tag.name === "g") {
      if (tag.closing) {
        if (stack.length > 0) {
          stack.pop();
          strokePathsDepth -= 1;
        } else {
          strokePathsDepth -= 1;
          if (strokePathsDepth !== 0) fail("unbalanced KanjiVG group structure");
          finishedStrokePaths = true;
        }
        continue;
      }
      if (tag.selfClosing) fail("self-closing groups are not supported in KanjiVG stroke paths");
      if (stack.length >= MAX_GROUPS) fail("source group count exceeds the accepted limit");
      strokePathsDepth += 1;
      const sourceGroupId = tag.attributes.id;
      if (!sourceGroupId) fail("every stroke-path group must have an id");
      if (seenGroupIds.has(sourceGroupId)) fail(`duplicate source group id ${sourceGroupId}`);
      seenGroupIds.add(sourceGroupId);
      const element = tag.attributes["kvg:element"] ?? null;
      const isGlyphRoot = !glyphRootFound && element !== null;
      if (isGlyphRoot) {
        if (element !== character) fail("root kvg:element does not match the requested character");
        glyphRootFound = true;
        rootGroupId = sourceGroupId;
      }
      const parentOccurrenceId = [...stack].reverse().find((frame) => frame.occurrenceId)?.occurrenceId ?? null;
      let occurrenceId: string | null = null;
      if (element !== null && !isGlyphRoot) {
        if (!element.trim()) fail("empty kvg:element annotation");
        occurrenceId = occurrenceNodeId(character, sourceGroupId);
      }
      const sourceGroup: KanjiVgSourceGroup = {
        sourceGroupId,
        parentSourceGroupId: stack.at(-1)?.sourceGroupId ?? null,
        element,
        position: tag.attributes["kvg:position"] ?? null,
        radicalMarker: tag.attributes["kvg:radical"] ?? null,
        phoneticMarker: tag.attributes["kvg:phon"] ?? null,
        occurrenceId,
        parentOccurrenceId,
      };
      groups.push(sourceGroup);
      stack.push({ sourceGroupId, element, occurrenceId, parentOccurrenceId, isGlyphRoot });
      continue;
    }

    if (tag.name === "path" && !tag.closing) {
      if (!tag.selfClosing) fail("path elements in the source slice must be self-closing");
      if (paths.length >= MAX_PATHS) fail("source path count exceeds the accepted limit");
      const sourcePathId = tag.attributes.id;
      const pathData = tag.attributes.d;
      if (!sourcePathId || !pathData || pathData.length > MAX_PATH_DATA_LENGTH) fail("source path id/data is missing or exceeds limits");
      if (seenPathIds.has(sourcePathId)) fail(`duplicate source path id ${sourcePathId}`);
      seenPathIds.add(sourcePathId);
      const componentOccurrenceId = [...stack].reverse().find((frame) => frame.occurrenceId)?.occurrenceId ?? null;
      paths.push({
        sourcePathId,
        pathData,
        strokeType: tag.attributes["kvg:type"] ?? null,
        componentOccurrenceId,
      });
      continue;
    }

    if (tag.name === "script" || tag.name === "foreignObject" || tag.attributes.href || tag.attributes["xlink:href"]) {
      fail("unsafe or unsupported SVG content encountered");
    }
  }

  if (!finishedStrokePaths || !glyphRootFound || !rootGroupId) fail("KanjiVG stroke-path hierarchy is incomplete");
  if (stack.length !== 0) fail("unclosed KanjiVG source group");
  if (paths.length === 0) fail("KanjiVG source contains no stroke paths");
  const graph = graphFromGroups(character, groups, digest);
  const expected: ExpectedStructuralProvenance = {
    sourceRef: KANJIVG_SOURCE_REF,
    sourceVersion: KANJIVG_SOURCE_VERSION,
    declaredContentDigest: digest,
    transformationVersion: KANJIVG_TRANSFORMATION_VERSION,
    license: KANJIVG_LICENSE,
    attribution: KANJIVG_ATTRIBUTION,
  };
  const validation = validateStructuralEvidenceGraph(graph, expected);
  if (!validation.valid) fail(`generated structural graph did not validate (${validation.issues.map((issue) => issue.code).join(", ")})`);
  return {
    character,
    sourceFile,
    sourceFileSha256: digest,
    rootGroupId,
    viewBox,
    sourceStrokeWidth: strokeWidth,
    paths,
    groups,
    graph,
  };
}
