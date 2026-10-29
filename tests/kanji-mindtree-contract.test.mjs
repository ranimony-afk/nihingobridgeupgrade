// Every record here is synthetic and deliberately makes no Kanji correctness claim.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  STRUCTURAL_CANONICALIZATION_VERSION,
  STRUCTURAL_GRAPH_CONTRACT_VERSION,
  STRUCTURAL_GRAPH_LIMITS,
  canonicalizeStructuralEvidenceGraph,
  deriveStructuralRelationId,
  validateStructuralEvidenceGraph,
} from "../src/lib/kanji/structuralEvidenceGraph.ts";

const expected = Object.freeze({
  sourceRef: "synthetic:mindtree-fixture:v2",
  sourceVersion: "fixture-version-2",
  declaredContentDigest: "a".repeat(64),
  transformationVersion: "fixture-transform-2",
  license: "TEST-ONLY",
  attribution: "Synthetic fixture only; no upstream source.",
});

function relation(type, from, to) {
  return { id: deriveStructuralRelationId(type, from, to), type, from, to };
}

function singleGlyphGraph() {
  return {
    contractVersion: STRUCTURAL_GRAPH_CONTRACT_VERSION,
    canonicalizationVersion: STRUCTURAL_CANONICALIZATION_VERSION,
    transformationVersion: expected.transformationVersion,
    provenance: {
      sourceRef: expected.sourceRef,
      sourceVersion: expected.sourceVersion,
      declaredContentDigest: expected.declaredContentDigest,
      license: expected.license,
      attribution: expected.attribution,
    },
    nodes: [
      { id: "glyph-A", kind: "glyph", character: "A" },
      { id: "component-x", kind: "component", identity: "component-key-x", character: "x" },
      {
        id: "occurrence-0",
        kind: "occurrence",
        glyphId: "glyph-A",
        componentId: "component-x",
        renderedAs: "x",
        position: "left",
        orderIndex: 0,
      },
    ],
    edges: [
      relation("contains", "glyph-A", "occurrence-0"),
      relation("instance_of", "occurrence-0", "component-x"),
    ],
  };
}

function addOccurrence(graph, { id, componentId, orderIndex, renderedAs, parentId = "glyph-A" }) {
  graph.nodes.push({
    id,
    kind: "occurrence",
    glyphId: "glyph-A",
    componentId,
    renderedAs,
    position: null,
    orderIndex,
  });
  graph.edges.push(
    relation("contains", parentId, id),
    relation("instance_of", id, componentId),
  );
}

function validation(graph, pins = expected) {
  return validateStructuralEvidenceGraph(graph, pins);
}

function codes(graph, pins = expected) {
  return validation(graph, pins).issues.map((issue) => issue.code);
}

test("accepts the explicitly synthetic v2 graph", () => {
  assert.deepEqual(validation(singleGlyphGraph()), { valid: true, issues: [] });
});

test("preserves nested occurrences and repeated component identities", () => {
  const nested = singleGlyphGraph();
  nested.nodes.push({ id: "component-y", kind: "component", identity: "component-key-y", character: "y" });
  addOccurrence(nested, { id: "occurrence-1", componentId: "component-y", orderIndex: 1, renderedAs: "y", parentId: "occurrence-0" });
  assert.equal(validation(nested).valid, true);

  const repeated = singleGlyphGraph();
  addOccurrence(repeated, { id: "occurrence-1", componentId: "component-x", orderIndex: 1, renderedAs: "x" });
  assert.equal(validation(repeated).valid, true);
});

test("keeps occurrence, component identity, character, and rendered form distinct", () => {
  const graph = singleGlyphGraph();
  graph.nodes.push({ id: "component-variant", kind: "component", identity: "variant-key", character: "V" });
  graph.nodes.find((node) => node.kind === "occurrence").componentId = "component-variant";
  graph.nodes.find((node) => node.kind === "occurrence").renderedAs = "Ａ";
  graph.edges[1] = relation("instance_of", "occurrence-0", "component-variant");
  graph.edges.push(relation("variant_of", "component-variant", "component-x"));
  assert.equal(validation(graph).valid, true);
  assert.equal(graph.nodes.find((node) => node.kind === "occurrence").renderedAs, "Ａ");
  assert.notEqual("Ａ", "A"); // Exact Unicode strings are not normalized.
});

test("rejects unknown top-level, nested, and overlay fields", () => {
  const graph = singleGlyphGraph();
  graph.aiExplanation = { text: "synthetic only" };
  graph.nodes[0].editorialNote = "not structural evidence";
  assert.ok(codes(graph).includes("unexpected_field"));
});

test("fails closed on accessors without invoking getters", () => {
  const graph = singleGlyphGraph();
  let invoked = false;
  Object.defineProperty(graph.nodes[1], "identity", {
    enumerable: true,
    get() { invoked = true; return "component-key-x"; },
  });
  assert.equal(validation(graph).valid, false);
  assert.equal(invoked, false);
});

test("fails closed on custom prototypes, symbols, proxies, and hostile reflection", () => {
  const custom = singleGlyphGraph();
  Object.setPrototypeOf(custom, { inherited: true });
  assert.ok(["invalid_object", "invalid_graph"].includes(codes(custom)[0]));

  const symbol = singleGlyphGraph();
  symbol[Symbol("extra")] = "synthetic";
  assert.equal(validation(symbol).valid, false);

  const hostile = new Proxy({}, { ownKeys() { throw new Error("private trap text"); } });
  const hostileResult = validation(hostile);
  assert.equal(hostileResult.valid, false);
  assert.doesNotMatch(JSON.stringify(hostileResult), /private trap text/);
});

test("requires dense ordinary arrays and rejects accessors/custom array properties", () => {
  const hole = singleGlyphGraph();
  delete hole.nodes[1];
  assert.ok(codes(hole).includes("invalid_array"));

  const accessor = singleGlyphGraph();
  Object.defineProperty(accessor.edges, "0", { enumerable: true, configurable: true, get() { throw new Error("must not run"); } });
  assert.ok(codes(accessor).includes("invalid_array"));

  const custom = singleGlyphGraph();
  custom.nodes.note = "not an ordinary dense array";
  assert.ok(codes(custom).includes("invalid_array"));
});

test("bounds graph cardinality and object fields before graph traversal", () => {
  const tooManyNodes = singleGlyphGraph();
  tooManyNodes.nodes = new Array(STRUCTURAL_GRAPH_LIMITS.nodes + 1).fill(null);
  assert.ok(codes(tooManyNodes).includes("resource_limit_exceeded"));

  const tooManyEdges = singleGlyphGraph();
  tooManyEdges.edges = new Array(STRUCTURAL_GRAPH_LIMITS.edges + 1).fill(null);
  assert.ok(codes(tooManyEdges).includes("resource_limit_exceeded"));

  const tooManyFields = singleGlyphGraph();
  for (let i = 0; i <= STRUCTURAL_GRAPH_LIMITS.objectFields; i++) tooManyFields[`extra-${i}`] = i;
  assert.equal(validation(tooManyFields).valid, false);
});

test("requires exact scalar strings but makes no Kanji repertoire restriction", () => {
  for (const character of ["", "AB", "\ud800", "\udc00"]) {
    const graph = singleGlyphGraph();
    graph.nodes[0].character = character;
    assert.ok(codes(graph).includes("invalid_character"), JSON.stringify(character));
  }
  for (const character of ["\u0000", "\ufdd0", "\uffff"]) {
    const graph = singleGlyphGraph();
    graph.nodes[0].character = character;
    assert.ok(codes(graph).includes("unsupported_character"), JSON.stringify(character));
  }
  for (const character of ["Ａ", "𠀀", "か", "☃"]) {
    const graph = singleGlyphGraph();
    graph.nodes[0].character = character;
    assert.equal(validation(graph).valid, true, `structural scalar ${JSON.stringify(character)} is not a correctness claim`);
  }
});

test("rejects exact duplicate identities while preserving distinct glyphs and components", () => {
  const duplicateGlyph = singleGlyphGraph();
  duplicateGlyph.nodes.push({ id: "glyph-alias", kind: "glyph", character: "A" });
  assert.ok(codes(duplicateGlyph).includes("duplicate_node_identity"));

  const duplicateComponent = singleGlyphGraph();
  duplicateComponent.nodes.push({ id: "component-copy", kind: "component", identity: "component-key-x", character: "x" });
  assert.ok(codes(duplicateComponent).includes("duplicate_node_identity"));

  const exactDistinct = singleGlyphGraph();
  exactDistinct.nodes.push({ id: "glyph-fullwidth", kind: "glyph", character: "Ａ" });
  assert.equal(validation(exactDistinct).valid, true);
});

test("does not equate distinct component identities by matching character text", () => {
  const graph = singleGlyphGraph();
  graph.nodes.push({ id: "component-x-source-2", kind: "component", identity: "source-identity-x-2", character: "x" });
  graph.edges.push(relation("variant_of", "component-x-source-2", "component-x"));
  assert.equal(validation(graph).valid, true);
});

test("rejects duplicate IDs, duplicate relations, and nondeterministic edge IDs", () => {
  const duplicateId = singleGlyphGraph();
  duplicateId.edges.push({ ...duplicateId.edges[0], to: "occurrence-0" });
  assert.ok(codes(duplicateId).includes("duplicate_edge_id"));

  const duplicateRelation = singleGlyphGraph();
  duplicateRelation.edges.push({ ...duplicateRelation.edges[0], id: deriveStructuralRelationId("contains", "glyph-A", "occurrence-0") });
  assert.ok(codes(duplicateRelation).includes("duplicate_edge_id"));
  assert.ok(codes(duplicateRelation).includes("duplicate_edge_relation"));

  const badId = singleGlyphGraph();
  badId.edges[0].id = "caller-chosen-edge-id";
  assert.ok(codes(badId).includes("invalid_identity"));
});

test("rejects dangling references, wrong typed edges, and cross-glyph ownership", () => {
  const dangling = singleGlyphGraph();
  dangling.edges[0] = relation("contains", "glyph-A", "not-present");
  assert.ok(codes(dangling).includes("dangling_reference"));

  const wrongType = singleGlyphGraph();
  wrongType.edges[0] = relation("instance_of", "glyph-A", "component-x");
  assert.ok(codes(wrongType).includes("invalid_relation"));

  const crossGlyph = singleGlyphGraph();
  crossGlyph.nodes.push({ id: "glyph-B", kind: "glyph", character: "B" });
  crossGlyph.edges[0] = relation("contains", "glyph-B", "occurrence-0");
  assert.ok(codes(crossGlyph).includes("cross_glyph_reference"));
});

test("requires one parent and one matching component edge for each occurrence", () => {
  const noParent = singleGlyphGraph();
  noParent.edges = noParent.edges.filter((edge) => edge.type !== "contains");
  assert.ok(codes(noParent).includes("missing_parent"));

  const noInstance = singleGlyphGraph();
  noInstance.edges = noInstance.edges.filter((edge) => edge.type !== "instance_of");
  assert.ok(codes(noInstance).includes("dangling_reference"));

  const multipleParents = singleGlyphGraph();
  multipleParents.nodes.push({ id: "glyph-B", kind: "glyph", character: "B" });
  multipleParents.edges.push(relation("contains", "glyph-B", "occurrence-0"));
  assert.ok(codes(multipleParents).includes("multiple_parents"));
});

test("detects graph-wide containment and variant cycles without recursion", () => {
  const containment = singleGlyphGraph();
  containment.nodes.push({ id: "component-y", kind: "component", identity: "component-key-y", character: "y" });
  addOccurrence(containment, { id: "occurrence-1", componentId: "component-y", orderIndex: 1, renderedAs: "y", parentId: "occurrence-0" });
  containment.edges.push(relation("contains", "occurrence-1", "occurrence-0"));
  assert.ok(codes(containment).includes("cycle"));

  const variants = singleGlyphGraph();
  variants.nodes.push(
    { id: "component-y", kind: "component", identity: "component-key-y", character: "y" },
    { id: "component-z", kind: "component", identity: "component-key-z", character: "z" },
  );
  variants.edges.push(relation("variant_of", "component-x", "component-y"), relation("variant_of", "component-y", "component-z"), relation("variant_of", "component-z", "component-x"));
  assert.ok(codes(variants).includes("cycle"));

  // A deep acyclic chain exercises iterative traversal, not recursive call depth.
  const chain = singleGlyphGraph();
  const depth = 12_000;
  chain.nodes[2].orderIndex = 0;
  for (let i = 1; i < depth; i++) {
    const componentId = `component-${i}`;
    chain.nodes.push({ id: componentId, kind: "component", identity: `identity-${i}`, character: null });
    addOccurrence(chain, { id: `occurrence-${i}`, componentId, orderIndex: i, renderedAs: `r${i}`, parentId: `occurrence-${i - 1}` });
  }
  assert.equal(validation(chain).valid, true);
});

test("rejects negative zero, duplicate per-glyph order, and malformed positions", () => {
  const negativeZero = singleGlyphGraph();
  negativeZero.nodes[2].orderIndex = -0;
  assert.ok(codes(negativeZero).includes("invalid_identity"));

  const duplicateOrder = singleGlyphGraph();
  addOccurrence(duplicateOrder, { id: "occurrence-1", componentId: "component-x", orderIndex: 0, renderedAs: "x" });
  assert.ok(codes(duplicateOrder).includes("duplicate_node_identity"));

  const missingPosition = singleGlyphGraph();
  delete missingPosition.nodes[2].position;
  assert.ok(codes(missingPosition).includes("invalid_node"));
});

test("requires provenance pins but treats digest as declared metadata only", () => {
  const graph = singleGlyphGraph();
  graph.provenance.declaredContentDigest = "not-a-sha256";
  assert.ok(codes(graph).includes("invalid_provenance"));

  const mismatched = singleGlyphGraph();
  mismatched.provenance.declaredContentDigest = "b".repeat(64);
  assert.ok(codes(mismatched).includes("provenance_mismatch"));

  const forgedButPinned = singleGlyphGraph();
  const pin = { ...expected, declaredContentDigest: "c".repeat(64) };
  forgedButPinned.provenance.declaredContentDigest = pin.declaredContentDigest;
  assert.equal(validation(forgedButPinned, pin).valid, true);
  // Equality of caller-supplied strings is intentionally not a source-byte check.
});

test("emits sorted, stable, index-independent issues and canonical JSON", () => {
  const first = singleGlyphGraph();
  first.edges[0].id = "bad-id";
  first.nodes[1].extra = true;
  const second = structuredClone(first);
  second.nodes.reverse();
  second.edges.reverse();
  assert.deepEqual(validation(first), validation(second));
  const paths = validation(first).issues.map((issue) => issue.path);
  assert.deepEqual(paths, [...paths].sort());

  const validA = singleGlyphGraph();
  const validB = structuredClone(validA);
  validB.nodes.reverse();
  validB.edges.reverse();
  validB.nodes = validB.nodes.map((node) => Object.fromEntries(Object.entries(node).reverse()));
  validB.edges = validB.edges.map((edge) => Object.fromEntries(Object.entries(edge).reverse()));
  assert.equal(canonicalizeStructuralEvidenceGraph(validA, expected), canonicalizeStructuralEvidenceGraph(validB, expected));
});

test("canonicalization refuses malformed graphs and does not mutate caller input", () => {
  const graph = singleGlyphGraph();
  const before = structuredClone(graph);
  const canonical = canonicalizeStructuralEvidenceGraph(graph, expected);
  assert.equal(typeof canonical, "string");
  assert.deepEqual(graph, before);
  graph.edges[0].to = "missing";
  assert.throws(() => canonicalizeStructuralEvidenceGraph(graph, expected), /dangling_reference/);
});

test("canonicalization and declared digest do not claim cryptographic verification", () => {
  const graph = singleGlyphGraph();
  const serialized = canonicalizeStructuralEvidenceGraph(graph, expected);
  assert.equal(typeof serialized, "string");
  assert.equal(graph.provenance.declaredContentDigest, expected.declaredContentDigest);
  assert.equal("contentDigest" in graph.provenance, false);
});

test("the module is source-isolated from runtime services and has no imports", async () => {
  const source = await readFile(new URL("../src/lib/kanji/structuralEvidenceGraph.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/m);
  assert.doesNotMatch(source, /\b(fetch|process\.env|createClient|supabase)\s*\(/i);
});
