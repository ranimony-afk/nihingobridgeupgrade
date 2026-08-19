import assert from "node:assert/strict";
import { test } from "node:test";
import { inclusiveGst, quotePrice } from "../../src/lib/billing/gst.ts";

test("inclusive GST splits 18% into CGST/SGST", () => {
  const quote = inclusiveGst(11800);
  assert.equal(quote.base + quote.tax, 11800);
  assert.equal(quote.cgst + quote.sgst, quote.tax);
  assert.equal(quote.base, 10000);
});

test("SAVE20 plus credit never goes negative", () => {
  const quote = quotePrice({ currency: "usd", listPrice: 999, percentOff: 20, credit: 5000 });
  assert.equal(quote.total, 0);
  assert.ok(quote.discount > 0);
});
