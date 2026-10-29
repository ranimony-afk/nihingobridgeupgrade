/**
 * Pure, fixture-friendly contract for Kanji structural evidence graphs.
 *
 * This module is deliberately separate from database-backed learner MindTree
 * services. It has no I/O, environment, network, filesystem, or package
 * dependencies. It validates claims and declared metadata; it does not verify
 * source bytes or linguistic correctness.
 */

export const STRUCTURAL_GRAPH_CONTRACT_VERSION = "nihongobridge-kanji-structure@2" as const;
export const STRUCTURAL_CANONICALIZATION_VERSION = "nihongobridge-canonical-json@1" as const;

/** Resource bounds for one untrusted graph. Cycle validation itself is iterative. */
export const STRUCTURAL_GRAPH_LIMITS = {
  nodes: 100_000,
  edges: 200_000,
  nodeIdLength: 512,
  edgeIdLength: 1_200,
  identityLength: 4_096,
  renderedAsLength: 4_096,
  positionLength: 256,
  provenanceFieldLength: 4_096,
  transformationVersionLength: 256,
  objectFields: 32,
} as const;

export type StructuralNode = GlyphNode | ComponentNode | ComponentOccurrenceNode;

/** A glyph is keyed by its exact character value; id is an opaque node key. */
export interface GlyphNode {
  id: string;
  kind: "glyph";
  character: string;
}

/** Reusable component identity. `identity` is opaque and never normalized. */
export interface ComponentNode {
  id: string;
  kind: "component";
  identity: string;
  /** Explicit null means this identity is not represented by one scalar. */
  character: string | null;
}

/** A particular component appearance inside one glyph. */
export interface ComponentOccurrenceNode {
  id: string;
  kind: "occurrence";
  glyphId: string;
  componentId: string;
  renderedAs: string;
  /** Required property; null means no position claim is made. */
  position: string | null;
  orderIndex: number;
}

export type StructuralRelationType = "contains" | "instance_of" | "variant_of";

export interface StructuralRelation {
  id: string;
  type: StructuralRelationType;
  from: string;
  to: string;
}

export interface StructuralSourceProvenance {
  sourceRef: string;
  sourceVersion: string;
  /** Declared lowercase SHA-256; equality to a pin does not verify source bytes. */
  declaredContentDigest: string;
  license: string;
  attribution: string;
}

export interface StructuralEvidenceGraph {
  contractVersion: typeof STRUCTURAL_GRAPH_CONTRACT_VERSION;
  canonicalizationVersion: typeof STRUCTURAL_CANONICALIZATION_VERSION;
  transformationVersion: string;
  provenance: StructuralSourceProvenance;
  nodes: StructuralNode[];
  edges: StructuralRelation[];
}

/** Caller-supplied expected policy pins, not observed source evidence. */
export interface ExpectedStructuralProvenance {
  sourceRef: string;
  sourceVersion: string;
  declaredContentDigest: string;
  transformationVersion: string;
  license: string;
  attribution: string;
}

export type StructuralGraphIssueCode =
  | "invalid_graph"
  | "invalid_expected_provenance"
  | "invalid_object"
  | "unexpected_field"
  | "invalid_array"
  | "contract_version_mismatch"
  | "canonicalization_version_mismatch"
  | "invalid_provenance"
  | "provenance_mismatch"
  | "invalid_node"
  | "invalid_edge"
  | "invalid_identity"
  | "invalid_character"
  | "unsupported_character"
  | "duplicate_node_id"
  | "duplicate_node_identity"
  | "duplicate_edge_id"
  | "duplicate_edge_relation"
  | "dangling_reference"
  | "invalid_relation"
  | "cross_glyph_reference"
  | "missing_parent"
  | "multiple_parents"
  | "self_link"
  | "cycle"
  | "resource_limit_exceeded";

export interface StructuralGraphIssue {
  code: StructuralGraphIssueCode;
  path: string;
  message: string;
}

export interface StructuralGraphValidation {
  valid: boolean;
  issues: StructuralGraphIssue[];
}

type SafeRecord = Record<string, unknown>;
type SnapshotResult = { record: SafeRecord | null; invalid: boolean };
type ArraySnapshotResult = {
  items: unknown[] | null;
  issue: "invalid_array" | "resource_limit_exceeded" | null;
};

const SHA256_LOWERCASE = /^[0-9a-f]{64}$/;
const NONCHARACTER_START = 0xfdd0;
const NONCHARACTER_END = 0xfdef;
const GRAPH_KEYS = [
  "contractVersion",
  "canonicalizationVersion",
  "transformationVersion",
  "provenance",
  "nodes",
  "edges",
] as const;
const PROVENANCE_KEYS = [
  "sourceRef",
  "sourceVersion",
  "declaredContentDigest",
  "license",
  "attribution",
] as const;
const EXPECTED_KEYS = [
  ...PROVENANCE_KEYS.slice(0, 3),
  "transformationVersion",
  ...PROVENANCE_KEYS.slice(3),
] as const;
const NODE_KEYS: Record<string, readonly string[]> = {
  glyph: ["id", "kind", "character"],
  component: ["id", "kind", "identity", "character"],
  occurrence: ["id", "kind", "glyphId", "componentId", "renderedAs", "position", "orderIndex"],
};
const EDGE_TYPES: readonly StructuralRelationType[] = ["contains", "instance_of", "variant_of"];

function isRecord(value: unknown): value is SafeRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Snapshot only plain data records; never invoke getters. Null-prototype data is accepted. */
function snapshotRecord(value: unknown): SnapshotResult {
  if (!isRecord(value)) return { record: null, invalid: false };
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return { record: null, invalid: true };
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length > STRUCTURAL_GRAPH_LIMITS.objectFields || ownKeys.some((key) => typeof key !== "string")) {
      return { record: null, invalid: true };
    }

    const snapshot = Object.create(null) as SafeRecord;
    for (const key of (ownKeys as string[]).sort(compareStrings)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return { record: null, invalid: true };
      }
      snapshot[key] = descriptor.value;
    }
    return { record: snapshot, invalid: false };
  } catch {
    // Proxies and hostile reflection hooks fail closed without exposing details.
    return { record: null, invalid: true };
  }
}

/** Snapshot a dense, ordinary array and reject holes, accessors, symbols, and custom properties. */
function snapshotArray(value: unknown, maximum: number): ArraySnapshotResult {
  if (!Array.isArray(value)) return { items: null, issue: "invalid_array" };
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return { items: null, issue: "invalid_array" };
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value")) {
      return { items: null, issue: "invalid_array" };
    }
    const length = lengthDescriptor.value;
    if (!Number.isSafeInteger(length) || length < 0) return { items: null, issue: "invalid_array" };
    if (length > maximum) return { items: null, issue: "resource_limit_exceeded" };
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length > length + 1 || ownKeys.some((key) => typeof key !== "string")) {
      return { items: null, issue: "invalid_array" };
    }
    const items: unknown[] = new Array(length);
    for (const key of ownKeys as string[]) {
      if (key === "length") continue;
      if (!/^(0|[1-9][0-9]*)$/.test(key)) return { items: null, issue: "invalid_array" };
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index >= length) return { items: null, issue: "invalid_array" };
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
        return { items: null, issue: "invalid_array" };
      }
      items[index] = descriptor.value;
    }
    for (let index = 0; index < length; index++) {
      if (!Object.prototype.hasOwnProperty.call(items, index)) return { items: null, issue: "invalid_array" };
    }
    return { items, issue: null };
  } catch {
    return { items: null, issue: "invalid_array" };
  }
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function nonEmptyString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim().length > 0;
}

function isNoncharacter(codePoint: number): boolean {
  return (
    (codePoint >= NONCHARACTER_START && codePoint <= NONCHARACTER_END) ||
    (codePoint & 0xffff) === 0xfffe ||
    (codePoint & 0xffff) === 0xffff
  );
}

/** One exact scalar; this intentionally does not decide which ranges are Kanji. */
function characterProblem(value: unknown): "invalid" | "unsupported" | null {
  if (typeof value !== "string" || (value.length !== 1 && value.length !== 2)) return "invalid";
  const points = Array.from(value);
  if (points.length !== 1) return "invalid";
  const codePoint = points[0].codePointAt(0);
  if (codePoint === undefined || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return "invalid";
  if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) || isNoncharacter(codePoint)) {
    return "unsupported";
  }
  return null;
}

function addIssue(
  issues: StructuralGraphIssue[],
  code: StructuralGraphIssueCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function addUnexpectedFields(
  record: SafeRecord,
  allowed: readonly string[],
  path: string,
  issues: StructuralGraphIssue[],
): void {
  for (const key of Object.keys(record).sort(compareStrings)) {
    if (!allowed.includes(key)) {
      // Do not echo arbitrary untrusted keys into output paths or messages.
      addIssue(issues, "unexpected_field", path, "Object contains a field not allowed by this contract.");
    }
  }
}

function appendAdjacency(adjacency: Map<string, string[]>, from: string, to: string): void {
  const targets = adjacency.get(from);
  if (targets) targets.push(to);
  else adjacency.set(from, [to]);
}

/** Edge IDs are framed tuples, so delimiters in endpoint IDs cannot collide. */
export function deriveStructuralRelationId(
  type: StructuralRelationType,
  from: string,
  to: string,
): string {
  return `edge@${STRUCTURAL_GRAPH_CONTRACT_VERSION}:${type}:${from.length}:${from}:${to.length}:${to}`;
}

function sortIssues(issues: StructuralGraphIssue[]): StructuralGraphIssue[] {
  return issues.sort((a, b) =>
    compareStrings(a.code, b.code) || compareStrings(a.path, b.path) || compareStrings(a.message, b.message),
  );
}

function failure(code: StructuralGraphIssueCode, path: string, message: string): StructuralGraphValidation {
  return { valid: false, issues: [{ code, path, message }] };
}

interface InternalValidation {
  validation: StructuralGraphValidation;
  graph: StructuralEvidenceGraph | null;
}

function validateInternal(input: unknown, expectedInput: unknown): InternalValidation {
  const issues: StructuralGraphIssue[] = [];
  const graphSnapshot = snapshotRecord(input);
  if (!graphSnapshot.record) {
    return {
      validation: failure(
        graphSnapshot.invalid ? "invalid_object" : "invalid_graph",
        "$",
        graphSnapshot.invalid ? "Graph must be a plain data object." : "Graph must be an object.",
      ),
      graph: null,
    };
  }
  const graph = graphSnapshot.record;
  addUnexpectedFields(graph, GRAPH_KEYS, "$", issues);

  const expectedSnapshot = snapshotRecord(expectedInput);
  if (!expectedSnapshot.record) {
    addIssue(
      issues,
      "invalid_expected_provenance",
      "$.expected",
      expectedSnapshot.invalid ? "Expected pins must be a plain data object." : "Expected pins must be an object.",
    );
  }
  const expected = expectedSnapshot.record;
  if (expected) addUnexpectedFields(expected, EXPECTED_KEYS, "$.expected", issues);

  if (graph.contractVersion !== STRUCTURAL_GRAPH_CONTRACT_VERSION) {
    addIssue(issues, "contract_version_mismatch", "$.contractVersion", "Contract version does not match.");
  }
  if (graph.canonicalizationVersion !== STRUCTURAL_CANONICALIZATION_VERSION) {
    addIssue(issues, "canonicalization_version_mismatch", "$.canonicalizationVersion", "Canonicalization version does not match.");
  }

  const transformationVersion = graph.transformationVersion;
  if (!nonEmptyString(transformationVersion, STRUCTURAL_GRAPH_LIMITS.transformationVersionLength)) {
    addIssue(issues, "invalid_provenance", "$.transformationVersion", "Transformation version must be a bounded, non-empty string.");
  }
  if (expected && graph.transformationVersion !== expected.transformationVersion) {
    addIssue(issues, "provenance_mismatch", "$.transformationVersion", "Transformation version does not match the expected pin.");
  }
  if (expected && !nonEmptyString(expected.transformationVersion, STRUCTURAL_GRAPH_LIMITS.transformationVersionLength)) {
    addIssue(issues, "invalid_expected_provenance", "$.expected.transformationVersion", "Expected transformation version must be a bounded, non-empty string.");
  }

  const provenanceSnapshot = snapshotRecord(graph.provenance);
  if (!provenanceSnapshot.record) {
    addIssue(
      issues,
      "invalid_provenance",
      "$.provenance",
      provenanceSnapshot.invalid ? "Provenance must be a plain data object." : "Provenance must be an object.",
    );
  }
  const provenance = provenanceSnapshot.record;
  if (provenance) {
    addUnexpectedFields(provenance, PROVENANCE_KEYS, "$.provenance", issues);
    for (const key of ["sourceRef", "sourceVersion", "license", "attribution"] as const) {
      if (!nonEmptyString(provenance[key], STRUCTURAL_GRAPH_LIMITS.provenanceFieldLength)) {
        addIssue(issues, "invalid_provenance", `$.provenance.${key}`, `${key} must be a bounded, non-empty string.`);
      }
    }
    if (typeof provenance.declaredContentDigest !== "string" || !SHA256_LOWERCASE.test(provenance.declaredContentDigest)) {
      addIssue(issues, "invalid_provenance", "$.provenance.declaredContentDigest", "Declared digest must be lowercase SHA-256 hex.");
    }
    if (expected) {
      for (const key of PROVENANCE_KEYS) {
        if (provenance[key] !== expected[key]) {
          addIssue(issues, "provenance_mismatch", `$.provenance.${key}`, `${key} does not match the expected policy pin.`);
        }
      }
    }
  }

  if (expected) {
    for (const key of ["sourceRef", "sourceVersion", "license", "attribution"] as const) {
      if (!nonEmptyString(expected[key], STRUCTURAL_GRAPH_LIMITS.provenanceFieldLength)) {
        addIssue(issues, "invalid_expected_provenance", `$.expected.${key}`, `Expected ${key} must be a bounded, non-empty string.`);
      }
    }
    if (typeof expected.declaredContentDigest !== "string" || !SHA256_LOWERCASE.test(expected.declaredContentDigest)) {
      addIssue(issues, "invalid_expected_provenance", "$.expected.declaredContentDigest", "Expected declared digest must be lowercase SHA-256 hex.");
    }
  }

  const nodeArray = snapshotArray(graph.nodes, STRUCTURAL_GRAPH_LIMITS.nodes);
  const edgeArray = snapshotArray(graph.edges, STRUCTURAL_GRAPH_LIMITS.edges);
  if (nodeArray.issue) {
    addIssue(issues, nodeArray.issue, "$.nodes", nodeArray.issue === "resource_limit_exceeded" ? "Node count exceeds the contract limit." : "nodes must be a dense ordinary array.");
  }
  if (edgeArray.issue) {
    addIssue(issues, edgeArray.issue, "$.edges", edgeArray.issue === "resource_limit_exceeded" ? "Edge count exceeds the contract limit." : "edges must be a dense ordinary array.");
  }
  const nodeValues = nodeArray.items ?? [];
  const edgeValues = edgeArray.items ?? [];

  const nodeById = new Map<string, StructuralNode>();
  const nodeIdentity = new Set<string>();
  const occurrenceOrders = new Set<string>();
  const safeNodes: StructuralNode[] = [];

  for (const rawNode of nodeValues) {
    const nodeSnapshot = snapshotRecord(rawNode);
    if (!nodeSnapshot.record) {
      addIssue(issues, "invalid_node", "$.nodes[]", nodeSnapshot.invalid ? "Node must be a plain data object." : "Node must be an object.");
      continue;
    }
    const node = nodeSnapshot.record;
    const kind = node.kind;
    if (
      typeof kind !== "string" ||
      (kind !== "glyph" && kind !== "component" && kind !== "occurrence") ||
      !Object.prototype.hasOwnProperty.call(NODE_KEYS, kind)
    ) {
      addIssue(issues, "invalid_node", "$.nodes[].kind", "Unsupported node kind.");
      continue;
    }
    addUnexpectedFields(node, NODE_KEYS[kind], "$.nodes[]", issues);

    const id = node.id;
    if (!nonEmptyString(id, STRUCTURAL_GRAPH_LIMITS.nodeIdLength)) {
      addIssue(issues, "invalid_identity", "$.nodes[].id", "Node id must be a bounded, non-empty string.");
    } else if (nodeById.has(id)) {
      addIssue(issues, "duplicate_node_id", "$.nodes[].id", "Node id is duplicated exactly.");
    }

    let typedNode: StructuralNode | null = null;
    if (kind === "glyph") {
      const problem = characterProblem(node.character);
      if (problem) {
        addIssue(issues, problem === "unsupported" ? "unsupported_character" : "invalid_character", "$.nodes[].character", problem === "unsupported" ? "Control characters and Unicode noncharacters are unsupported." : "Glyph character must be exactly one Unicode scalar.");
      } else {
        const identity = JSON.stringify(["glyph", node.character]);
        if (nodeIdentity.has(identity)) addIssue(issues, "duplicate_node_identity", "$.nodes[].character", "Exact glyph identity is duplicated.");
        nodeIdentity.add(identity);
      }
      if (nonEmptyString(id, STRUCTURAL_GRAPH_LIMITS.nodeIdLength) && typeof node.character === "string") {
        typedNode = { id, kind, character: node.character };
      }
    } else if (kind === "component") {
      if (!nonEmptyString(node.identity, STRUCTURAL_GRAPH_LIMITS.identityLength)) {
        addIssue(issues, "invalid_identity", "$.nodes[].identity", "Component identity must be a bounded, non-empty string.");
      } else {
        const identity = JSON.stringify(["component", node.identity]);
        if (nodeIdentity.has(identity)) addIssue(issues, "duplicate_node_identity", "$.nodes[].identity", "Exact component identity is duplicated.");
        nodeIdentity.add(identity);
      }
      if (!Object.prototype.hasOwnProperty.call(node, "character")) {
        addIssue(issues, "invalid_node", "$.nodes[].character", "Component character must be explicitly null or a scalar.");
      } else if (node.character !== null) {
        const problem = characterProblem(node.character);
        if (problem) addIssue(issues, problem === "unsupported" ? "unsupported_character" : "invalid_character", "$.nodes[].character", problem === "unsupported" ? "Control characters and Unicode noncharacters are unsupported." : "Component character must be null or exactly one Unicode scalar.");
      }
      if (
        nonEmptyString(id, STRUCTURAL_GRAPH_LIMITS.nodeIdLength) &&
        nonEmptyString(node.identity, STRUCTURAL_GRAPH_LIMITS.identityLength) &&
        (node.character === null || (typeof node.character === "string" && characterProblem(node.character) === null))
      ) {
        typedNode = { id, kind, identity: node.identity, character: node.character as string | null };
      }
    } else {
      const glyphId = node.glyphId;
      const componentId = node.componentId;
      const renderedAs = node.renderedAs;
      const position = node.position;
      const orderIndex = node.orderIndex;
      if (!nonEmptyString(glyphId, STRUCTURAL_GRAPH_LIMITS.nodeIdLength)) addIssue(issues, "invalid_identity", "$.nodes[].glyphId", "glyphId must be a bounded, non-empty string.");
      if (!nonEmptyString(componentId, STRUCTURAL_GRAPH_LIMITS.nodeIdLength)) addIssue(issues, "invalid_identity", "$.nodes[].componentId", "componentId must be a bounded, non-empty string.");
      if (!nonEmptyString(renderedAs, STRUCTURAL_GRAPH_LIMITS.renderedAsLength)) addIssue(issues, "invalid_identity", "$.nodes[].renderedAs", "renderedAs must be a bounded, non-empty exact literal.");
      if (position !== null && !nonEmptyString(position, STRUCTURAL_GRAPH_LIMITS.positionLength)) addIssue(issues, "invalid_node", "$.nodes[].position", "position must be null or a bounded, non-empty string.");
      if (!Object.prototype.hasOwnProperty.call(node, "position")) addIssue(issues, "invalid_node", "$.nodes[].position", "position must be explicitly null or a string.");
      if (!Number.isSafeInteger(orderIndex) || (orderIndex as number) < 0 || Object.is(orderIndex, -0)) {
        addIssue(issues, "invalid_identity", "$.nodes[].orderIndex", "orderIndex must be a non-negative safe integer other than negative zero.");
      }
      if (nonEmptyString(glyphId, STRUCTURAL_GRAPH_LIMITS.nodeIdLength) && Number.isSafeInteger(orderIndex) && (orderIndex as number) >= 0 && !Object.is(orderIndex, -0)) {
        const orderKey = JSON.stringify([glyphId, orderIndex]);
        if (occurrenceOrders.has(orderKey)) addIssue(issues, "duplicate_node_identity", "$.nodes[].orderIndex", "Occurrence orderIndex must be unique within its glyph.");
        occurrenceOrders.add(orderKey);
      }
      if (
        nonEmptyString(id, STRUCTURAL_GRAPH_LIMITS.nodeIdLength) &&
        nonEmptyString(glyphId, STRUCTURAL_GRAPH_LIMITS.nodeIdLength) &&
        nonEmptyString(componentId, STRUCTURAL_GRAPH_LIMITS.nodeIdLength) &&
        nonEmptyString(renderedAs, STRUCTURAL_GRAPH_LIMITS.renderedAsLength) &&
        (position === null || nonEmptyString(position, STRUCTURAL_GRAPH_LIMITS.positionLength)) &&
        Number.isSafeInteger(orderIndex) && (orderIndex as number) >= 0 && !Object.is(orderIndex, -0)
      ) {
        typedNode = { id, kind, glyphId, componentId, renderedAs, position: position as string | null, orderIndex: orderIndex as number };
      }
    }

    if (typedNode) {
      if (!nodeById.has(typedNode.id)) nodeById.set(typedNode.id, typedNode);
      safeNodes.push(typedNode);
    }
  }

  const edgeIds = new Set<string>();
  const edgeRelations = new Set<string>();
  const parentCount = new Map<string, number>();
  const instanceCount = new Map<string, number>();
  const containmentAdjacency = new Map<string, string[]>();
  const variantAdjacency = new Map<string, string[]>();
  const safeEdges: StructuralRelation[] = [];

  for (const rawEdge of edgeValues) {
    const edgeSnapshot = snapshotRecord(rawEdge);
    if (!edgeSnapshot.record) {
      addIssue(issues, "invalid_edge", "$.edges[]", edgeSnapshot.invalid ? "Edge must be a plain data object." : "Edge must be an object.");
      continue;
    }
    const edge = edgeSnapshot.record;
    addUnexpectedFields(edge, ["id", "type", "from", "to"], "$.edges[]", issues);
    const id = edge.id;
    const type = edge.type;
    const fromId = edge.from;
    const toId = edge.to;
    if (!nonEmptyString(id, STRUCTURAL_GRAPH_LIMITS.edgeIdLength)) addIssue(issues, "invalid_identity", "$.edges[].id", "Edge id must be a bounded, non-empty string.");
    if (!nonEmptyString(fromId, STRUCTURAL_GRAPH_LIMITS.nodeIdLength) || !nonEmptyString(toId, STRUCTURAL_GRAPH_LIMITS.nodeIdLength)) addIssue(issues, "invalid_identity", "$.edges[]", "Edge endpoints must be bounded, non-empty strings.");
    if (typeof type !== "string" || !(EDGE_TYPES as readonly string[]).includes(type)) {
      addIssue(issues, "invalid_relation", "$.edges[].type", "Unsupported relation type.");
      continue;
    }
    if (!nonEmptyString(fromId, STRUCTURAL_GRAPH_LIMITS.nodeIdLength) || !nonEmptyString(toId, STRUCTURAL_GRAPH_LIMITS.nodeIdLength)) continue;

    const expectedId = deriveStructuralRelationId(type as StructuralRelationType, fromId, toId);
    if (id !== expectedId) addIssue(issues, "invalid_identity", "$.edges[].id", "Edge id does not match the deterministic relation identity.");
    if (nonEmptyString(id, STRUCTURAL_GRAPH_LIMITS.edgeIdLength)) {
      if (edgeIds.has(id)) addIssue(issues, "duplicate_edge_id", "$.edges[].id", "Edge id is duplicated exactly.");
      edgeIds.add(id);
    }
    const relationKey = JSON.stringify([type, fromId, toId]);
    if (edgeRelations.has(relationKey)) addIssue(issues, "duplicate_edge_relation", "$.edges[]", "Directed relationship is duplicated.");
    edgeRelations.add(relationKey);

    const from = nodeById.get(fromId);
    const to = nodeById.get(toId);
    if (!from || !to) {
      addIssue(issues, "dangling_reference", "$.edges[]", "Edge endpoint does not resolve to a valid node.");
      continue;
    }
    const relation: StructuralRelation = { id: typeof id === "string" ? id : "", type: type as StructuralRelationType, from: fromId, to: toId };
    safeEdges.push(relation);

    if (type === "contains") {
      if ((from.kind !== "glyph" && from.kind !== "occurrence") || to.kind !== "occurrence") {
        addIssue(issues, "invalid_relation", "$.edges[]", "contains must point from a glyph or occurrence to an occurrence.");
        continue;
      }
      if (from.id === to.id) addIssue(issues, "self_link", "$.edges[]", "An occurrence cannot contain itself.");
      const child = to as ComponentOccurrenceNode;
      if (from.kind === "glyph" && child.glyphId !== from.id) {
        addIssue(issues, "cross_glyph_reference", "$.edges[]", "Glyph root may contain only occurrences owned by that glyph.");
      } else if (from.kind === "occurrence" && from.glyphId !== child.glyphId) {
        addIssue(issues, "cross_glyph_reference", "$.edges[]", "Parent and child occurrences must belong to the same glyph.");
      }
      parentCount.set(child.id, (parentCount.get(child.id) ?? 0) + 1);
      appendAdjacency(containmentAdjacency, from.id, to.id);
    } else if (type === "instance_of") {
      if (from.kind === "occurrence") instanceCount.set(from.id, (instanceCount.get(from.id) ?? 0) + 1);
      if (from.kind !== "occurrence" || to.kind !== "component") {
        addIssue(issues, "invalid_relation", "$.edges[]", "instance_of must point from an occurrence to a component.");
      } else if (from.componentId !== to.id) {
        addIssue(issues, "invalid_relation", "$.edges[]", "instance_of target must match occurrence.componentId.");
      }
    } else {
      if (from.kind !== "component" || to.kind !== "component") {
        addIssue(issues, "invalid_relation", "$.edges[]", "variant_of must point from one component identity to another.");
      } else if (from.id === to.id || from.identity === to.identity) {
        addIssue(issues, "self_link", "$.edges[]", "variant_of must connect distinct exact component identities.");
      } else {
        appendAdjacency(variantAdjacency, from.id, to.id);
      }
    }
  }

  for (const node of safeNodes) {
    if (node.kind !== "occurrence") continue;
    const glyph = nodeById.get(node.glyphId);
    const component = nodeById.get(node.componentId);
    if (!glyph || glyph.kind !== "glyph") addIssue(issues, "dangling_reference", "$.nodes[].glyphId", "Occurrence glyphId must reference a glyph node.");
    if (!component || component.kind !== "component") addIssue(issues, "dangling_reference", "$.nodes[].componentId", "Occurrence componentId must reference a component node.");
    const parents = parentCount.get(node.id) ?? 0;
    if (parents === 0) addIssue(issues, "missing_parent", "$.nodes[]", "Every occurrence must have one containing glyph or parent occurrence.");
    if (parents > 1) addIssue(issues, "multiple_parents", "$.nodes[]", "An occurrence cannot have multiple structural parents.");
    const instances = instanceCount.get(node.id) ?? 0;
    if (instances === 0) addIssue(issues, "dangling_reference", "$.nodes[].componentId", "Occurrence must have one instance_of edge.");
    if (instances > 1) addIssue(issues, "invalid_relation", "$.nodes[]", "Occurrence must have exactly one instance_of edge.");
  }

  detectCycles(containmentAdjacency, "contains", issues);
  detectCycles(variantAdjacency, "variant_of", issues);

  const sortedIssues = sortIssues(issues);
  if (sortedIssues.length > 0) return { validation: { valid: false, issues: sortedIssues }, graph: null };

  // All untrusted values have been copied and validated before this typed projection.
  const safeProvenance = provenance as SafeRecord;
  const canonicalGraph: StructuralEvidenceGraph = {
    contractVersion: STRUCTURAL_GRAPH_CONTRACT_VERSION,
    canonicalizationVersion: STRUCTURAL_CANONICALIZATION_VERSION,
    transformationVersion: transformationVersion as string,
    provenance: {
      sourceRef: safeProvenance.sourceRef as string,
      sourceVersion: safeProvenance.sourceVersion as string,
      declaredContentDigest: safeProvenance.declaredContentDigest as string,
      license: safeProvenance.license as string,
      attribution: safeProvenance.attribution as string,
    },
    nodes: safeNodes,
    edges: safeEdges,
  };
  return { validation: { valid: true, issues: [] }, graph: canonicalGraph };
}

/**
 * Validate unknown runtime data. Malformed objects, accessors, proxies, and
 * reflection failures return a stable issue instead of leaking exceptions.
 */
export function validateStructuralEvidenceGraph(input: unknown, expected: unknown): StructuralGraphValidation {
  try {
    return validateInternal(input, expected).validation;
  } catch {
    return failure("invalid_graph", "$", "Graph cannot be safely inspected as plain data.");
  }
}

/**
 * Canonical JSON v1: recursively sorted object keys, nodes/edges sorted by ID,
 * JSON string escaping, and only validated finite safe integer numeric fields.
 * This function does not compute a cryptographic digest.
 */
export function canonicalizeStructuralEvidenceGraph(input: unknown, expected: unknown): string {
  let checked: InternalValidation;
  try {
    checked = validateInternal(input, expected);
  } catch {
    throw new Error("Invalid structural evidence graph: unsafe input.");
  }
  if (!checked.validation.valid || !checked.graph) {
    const summary = checked.validation.issues.map((issue) => `${issue.code}@${issue.path}`).join(", ");
    throw new Error(`Invalid structural evidence graph: ${summary}`);
  }

  const graph = checked.graph;
  const sortedGraph: StructuralEvidenceGraph = {
    contractVersion: graph.contractVersion,
    canonicalizationVersion: graph.canonicalizationVersion,
    transformationVersion: graph.transformationVersion,
    provenance: { ...graph.provenance },
    nodes: [...graph.nodes].sort((a, b) => compareStrings(a.id, b.id)),
    edges: [...graph.edges].sort((a, b) => compareStrings(a.id, b.id)),
  };
  return JSON.stringify(sortObjectKeys(sortedGraph));
}

function detectCycles(
  adjacency: Map<string, string[]>,
  relation: "contains" | "variant_of",
  issues: StructuralGraphIssue[],
): void {
  const vertices = new Set<string>();
  const indegree = new Map<string, number>();
  for (const [from, targets] of adjacency) {
    vertices.add(from);
    if (!indegree.has(from)) indegree.set(from, 0);
    for (const to of targets) {
      vertices.add(to);
      indegree.set(to, (indegree.get(to) ?? 0) + 1);
    }
  }
  const queue = [...vertices].filter((id) => (indegree.get(id) ?? 0) === 0).sort(compareStrings);
  let cursor = 0;
  let visited = 0;
  while (cursor < queue.length) {
    const id = queue[cursor++];
    visited++;
    for (const next of adjacency.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  if (visited !== vertices.size) {
    addIssue(issues, "cycle", `$.edges[${relation}]`, `Directed ${relation} relationships must be acyclic.`);
  }
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (isRecord(value)) {
    const sorted = Object.create(null) as SafeRecord;
    for (const key of Object.keys(value).sort(compareStrings)) sorted[key] = sortObjectKeys(value[key]);
    return sorted;
  }
  return value;
}
