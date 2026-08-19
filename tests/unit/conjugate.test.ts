import assert from "node:assert/strict";
import { test } from "node:test";
import { conjugate } from "../../src/lib/dict/conjugate.ts";

test("ichidan 食べる has polite and te forms", () => {
  const forms = conjugate("食べる", "たべる", "verb");
  assert.ok(forms.some((row) => row.form === "masu" && row.surface === "食べます"));
  assert.ok(forms.some((row) => row.form === "te" && row.surface === "食べて"));
});

test("godan 飲む uses んで", () => {
  const forms = conjugate("飲む", "のむ", "verb");
  assert.ok(forms.some((row) => row.form === "te" && row.surface === "飲んで"));
});

test("i-adjective 高い conjugates", () => {
  const forms = conjugate("高い", "たかい", "adj");
  assert.ok(forms.some((row) => row.form === "nai" && row.surface === "高くない"));
});
