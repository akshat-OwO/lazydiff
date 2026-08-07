import { strictEqual } from "node:assert";
import { test } from "node:test";

import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";

import {
  countChangedLines,
  describeChangeWithoutHunks,
  describeModeChange,
  sumChangedLines,
} from "../../src/lib/file-diff-summary.ts";

const parseSingleFile = (patch: string): FileDiffMetadata => {
  const [file] = parsePatchFiles(patch).flatMap(({ files }) => files);

  if (file === undefined) {
    throw new Error("The patch did not contain a file diff");
  }

  return file;
};

const binaryPatch = `diff --git a/blob.bin b/blob.bin
new file mode 100644
index 0000000..c94be36
Binary files /dev/null and b/blob.bin differ
`;

const pureRenamePatch = `diff --git a/old.txt b/new.txt
similarity index 100%
rename from old.txt
rename to new.txt
`;

const modeOnlyPatch = `diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755
`;

const emptyNewFilePatch = `diff --git a/empty.txt b/empty.txt
new file mode 100644
index 0000000..e69de29
`;

const textPatch = `diff --git a/a.txt b/a.txt
index 5626abf..f719efd 100644
--- a/a.txt
+++ b/a.txt
@@ -1,2 +1,2 @@
 kept
-one
+two
`;

test("changes without hunks are described instead of rendered blank", () => {
  strictEqual(
    describeChangeWithoutHunks(parseSingleFile(binaryPatch)),
    "No textual changes to show. This is usually a binary or empty file."
  );
  strictEqual(
    describeChangeWithoutHunks(parseSingleFile(pureRenamePatch)),
    "Renamed without content changes."
  );
  strictEqual(
    describeChangeWithoutHunks(parseSingleFile(modeOnlyPatch)),
    "File mode changed from 100644 to 100755."
  );
  strictEqual(
    describeChangeWithoutHunks(parseSingleFile(emptyNewFilePatch)),
    "No textual changes to show. This is usually a binary or empty file."
  );
});

test("a diff with hunks renders its lines instead of a description", () => {
  const fileDiff = parseSingleFile(textPatch);

  strictEqual(describeChangeWithoutHunks(fileDiff), null);
  strictEqual(describeModeChange(fileDiff), null);

  const { additions, deletions } = countChangedLines(fileDiff);

  strictEqual(additions, 1);
  strictEqual(deletions, 1);
});

test("a mode change is reported alongside content changes", () => {
  const fileDiff = parseSingleFile(`diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755
index 5626abf..f719efd
--- a/script.sh
+++ b/script.sh
@@ -1 +1 @@
-one
+two
`);

  strictEqual(describeModeChange(fileDiff), "mode 100644 → 100755");
  strictEqual(describeChangeWithoutHunks(fileDiff), null);
});

test("sumChangedLines totals additions and deletions across files", () => {
  const fileDiffs = parsePatchFiles(`${textPatch}${textPatch}`).flatMap(
    ({ files }) => files
  );
  const { additions, deletions } = sumChangedLines(fileDiffs);

  strictEqual(additions, 2);
  strictEqual(deletions, 2);
});
