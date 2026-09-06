import { test } from "node:test";
import assert from "node:assert/strict";
import { toOre, fromOre, round2 } from "../../shared/money.js";

test("öre-konvertering round-trip 12.34 → 1234 öre → 12.34", () => {
  assert.equal(toOre(12.34), 1234);
  assert.equal(fromOre(1234), 12.34);
  assert.equal(fromOre(toOre(12.34)), 12.34);
});

test("öre-konvertering hanterar 0, 0.01 och 99.99 utan flyttalsdrift", () => {
  assert.equal(toOre(0), 0);
  assert.equal(fromOre(0), 0);
  assert.equal(toOre(0.01), 1);
  assert.equal(fromOre(1), 0.01);
  assert.equal(toOre(99.99), 9999);
  assert.equal(fromOre(toOre(99.99)), 99.99);
  assert.equal(toOre(10.10), 1010);
  assert.equal(fromOre(1010), 10.1);
  assert.equal(round2(10.1), 10.1);
});
