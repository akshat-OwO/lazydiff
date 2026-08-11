import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import {
  chunkItems,
  splitUnifiedPatch,
  toDiffBatches,
} from "../../src/lib/diff-batches.ts";

test("chunkItems groups values into fixed-size batches", () => {
  deepStrictEqual(chunkItems([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  deepStrictEqual(chunkItems([], 20), []);
});

test("splitUnifiedPatch separates multi-file patches", () => {
  const patch = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-a
+b
diff --git a/b.ts b/b.ts
--- a/b.ts
+++ b/b.ts
@@ -1 +1 @@
-c
+d
`;

  deepStrictEqual(splitUnifiedPatch(patch).length, 2);
  strictEqual(
    splitUnifiedPatch(patch)[0]?.startsWith("diff --git a/a.ts"),
    true
  );
  strictEqual(
    splitUnifiedPatch(patch)[1]?.startsWith("diff --git a/b.ts"),
    true
  );
});

test("toDiffBatches emits reset on the first batch and complete on the last", () => {
  const patches = Array.from({ length: 45 }, (_, index) => {
    const name = `f${index}.ts`;
    return `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n-a\n+b\n`;
  });
  const batches = toDiffBatches(patches, 20);

  strictEqual(batches.length, 3);
  strictEqual(batches[0]?.reset, true);
  strictEqual(batches[0]?.complete, false);
  strictEqual(batches[1]?.reset, false);
  strictEqual(batches[1]?.complete, false);
  strictEqual(batches[2]?.reset, false);
  strictEqual(batches[2]?.complete, true);
});

test("toDiffBatches returns a single empty complete batch for no files", () => {
  deepStrictEqual(toDiffBatches([]), [
    { complete: true, patch: "", reset: true },
  ]);
});
