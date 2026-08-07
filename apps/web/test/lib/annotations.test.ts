import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";

import {
  annotationAnchorForRange,
  extractDiffSnippet,
} from "../../src/lib/annotation-snippet.ts";
import { formatAnnotationsMarkdown } from "../../src/lib/annotations.ts";
import type { DiffAnnotation } from "../../src/lib/annotations.ts";

const parseSingleFile = (patch: string): FileDiffMetadata => {
  const [file] = parsePatchFiles(patch).flatMap(({ files }) => files);

  if (file === undefined) {
    throw new Error("The patch did not contain a file diff");
  }

  return file;
};

const textPatch = `diff --git a/a.txt b/a.txt
index 5626abf..f719efd 100644
--- a/a.txt
+++ b/a.txt
@@ -1,4 +1,5 @@
 kept
-one
+two
 context
+added
 more
`;

test("extractDiffSnippet returns a unified snippet for an addition line", () => {
  const fileDiff = parseSingleFile(textPatch);

  strictEqual(
    extractDiffSnippet(fileDiff, {
      end: 2,
      side: "additions",
      start: 2,
    }),
    "+two"
  );
});

test("extractDiffSnippet returns a unified snippet for a deletion line", () => {
  const fileDiff = parseSingleFile(textPatch);

  strictEqual(
    extractDiffSnippet(fileDiff, {
      end: 2,
      side: "deletions",
      start: 2,
    }),
    "-one"
  );
});

test("extractDiffSnippet includes a contiguous additions-side range", () => {
  const fileDiff = parseSingleFile(textPatch);

  strictEqual(
    extractDiffSnippet(fileDiff, {
      end: 4,
      side: "additions",
      start: 2,
    }),
    "+two\n context\n+added"
  );
});

test("annotationAnchorForRange prefers the end of the selection", () => {
  deepStrictEqual(
    annotationAnchorForRange({
      end: 4,
      endSide: "additions",
      side: "additions",
      start: 2,
    }),
    { lineNumber: 4, side: "additions" }
  );
});

test("formatAnnotationsMarkdown quotes the chosen code for agents", () => {
  const annotations: readonly DiffAnnotation[] = [
    {
      codeDiff: "+two\n+added",
      comment: "Prefer clearer names here.",
      filePath: "a.txt",
      id: "1",
      range: { end: 4, side: "additions", start: 2 },
    },
    {
      codeDiff: "-one",
      comment: "Why was this removed?",
      filePath: "a.txt",
      id: "2",
      range: { end: 2, side: "deletions", start: 2 },
    },
  ];

  strictEqual(
    formatAnnotationsMarkdown(annotations),
    `### Annotation 1
> a.txt
> +two
> +added

Prefer clearer names here.

### Annotation 2
> a.txt
> -one

Why was this removed?`
  );
});
