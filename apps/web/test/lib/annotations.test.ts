import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";

import {
  annotationAnchorForRange,
  extractDiffSnippet,
} from "../../src/lib/annotation-snippet.ts";
import {
  annotationMatchesFileDiff,
  annotationsForScope,
  formatAnnotationsMarkdown,
} from "../../src/lib/annotations.ts";
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

const replacedAdditionPatch = `diff --git a/a.txt b/a.txt
index 5626abf..aaaaaaa 100644
--- a/a.txt
+++ b/a.txt
@@ -1,4 +1,5 @@
 kept
-one
+three
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
      scope: "unstaged",
    },
    {
      codeDiff: "-one",
      comment: "Why was this removed?",
      filePath: "a.txt",
      id: "2",
      range: { end: 2, side: "deletions", start: 2 },
      scope: "unstaged",
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

test("annotationsForScope keeps change scopes partitioned", () => {
  const annotations: readonly DiffAnnotation[] = [
    {
      codeDiff: "+two",
      comment: "unstaged note",
      filePath: "a.txt",
      id: "1",
      range: { end: 2, side: "additions", start: 2 },
      scope: "unstaged",
    },
    {
      codeDiff: "+two",
      comment: "staged note",
      filePath: "a.txt",
      id: "2",
      range: { end: 2, side: "additions", start: 2 },
      scope: "staged",
    },
  ];

  deepStrictEqual(
    annotationsForScope(annotations, "unstaged").map(({ id }) => id),
    ["1"]
  );
  deepStrictEqual(
    annotationsForScope(annotations, "staged").map(({ id }) => id),
    ["2"]
  );
});

test("annotationMatchesFileDiff rejects a replacement line at the same coordinates", () => {
  const originalDiff = parseSingleFile(textPatch);
  const replacedDiff = parseSingleFile(replacedAdditionPatch);
  const annotation: DiffAnnotation = {
    codeDiff: extractDiffSnippet(originalDiff, {
      end: 2,
      side: "additions",
      start: 2,
    }),
    comment: "About the old addition",
    filePath: "a.txt",
    id: "1",
    range: { end: 2, side: "additions", start: 2 },
    scope: "unstaged",
  };

  strictEqual(annotationMatchesFileDiff(annotation, originalDiff), true);
  strictEqual(annotationMatchesFileDiff(annotation, replacedDiff), false);
  strictEqual(extractDiffSnippet(replacedDiff, annotation.range), "+three");
});
