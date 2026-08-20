import assert from "node:assert/strict";
import { test } from "node:test";
import { mindTree } from "../../src/lib/kanji/tree.ts";

test("mind tree groups characters by branch", () => {
  const tree = mindTree([
    { character: "山", branch: "Nature" },
    { character: "川", branch: "Nature" },
    { character: "人", branch: "Humans" },
  ]);
  assert.equal(tree.name, "漢");
  const nature = tree.children?.find((node) => node.name === "Nature");
  assert.equal(nature?.children?.length, 2);
});
