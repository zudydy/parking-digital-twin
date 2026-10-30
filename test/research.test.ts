import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeHistory, observedSeries } from "../src/data/history.js";
import { crossedPairedCI, sampleStd } from "../src/research/statistics.js";
import { validateSnapshot } from "../src/data/incheon.js";
test("crossed bootstrap preserves pairing and accounts for both seed axes", () => {
  assert.deepEqual(
    crossedPairedCI([
      [3, 3],
      [3, 3],
    ]),
    [3, 3],
  );
  assert.deepEqual(
    crossedPairedCI([
      [0, 0],
      [0, 0],
    ]),
    [0, 0],
  );
  const ci = crossedPairedCI([
    [1, 2, 3],
    [5, 6, 7],
  ]);
  assert.ok(ci[0] < 4 && ci[1] > 4);
  assert.deepEqual(
    ci,
    crossedPairedCI([
      [1, 2, 3],
      [5, 6, 7],
    ]),
  );
  assert.throws(() => crossedPairedCI([[1], [2, 3]]));
  assert.throws(() => crossedPairedCI([[NaN]]));
  assert.equal(sampleStd([1, 2, 3]), 1);
});
test("observations deduplicate official timestamps without fabricating missing minutes", async () => {
  const s = validateSnapshot(
    JSON.parse(await readFile("public/data/incheon-t1.json", "utf8")),
  );
  const later = {
    ...s,
    updatedAt: new Date(Date.parse(s.updatedAt) + 180000).toISOString(),
  };
  const history = normalizeHistory([later, s, s]);
  assert.equal(history.length, 2);
  assert.equal(history[0]!.updatedAt, s.updatedAt);
  assert.deepEqual(
    observedSeries(history, "ground").map((p) => p.minute),
    [0, 3],
  );
  assert.throws(() => normalizeHistory([{}]));
});
