import { deepStrictEqual, match, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import type { GithubPrReviewThread } from "@lazydiff/protocol";
import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";

import {
  collectDiffLineAnnotationsByFile,
  remoteThreadLineAnnotation,
  remoteThreadsForFilePath,
  resolveAnnotationRenderTarget,
  resolveCodeViewItem,
} from "../../src/components/changed-files-diffs-helpers.ts";

const parseSingleFile = (patch: string): FileDiffMetadata => {
  const [file] = parsePatchFiles(patch).flatMap(({ files }) => files);

  if (file === undefined) {
    throw new Error("The patch did not contain a file diff");
  }

  return file;
};

const thread = (
  overrides: Partial<GithubPrReviewThread> &
    Pick<GithubPrReviewThread, "id" | "path" | "line">
): GithubPrReviewThread => ({
  comments: [
    {
      authorLogin: "akshat",
      body: "note",
      createdAt: "2026-08-11T00:00:00Z",
      databaseId: 1,
      id: "COMMENT_1",
    },
  ],
  isOutdated: false,
  isResolved: false,
  side: "RIGHT",
  startLine: null,
  ...overrides,
});

const textPatch = `diff --git a/src/a.ts b/src/a.ts
index 5626abf..f719efd 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,4 +1,5 @@
 kept
-one
+two
 context
+added
`;

test("remoteThreadsForFilePath keeps current in-range threads for a file", () => {
  const threads = [
    thread({ id: "T1", line: 10, path: "src/a.ts" }),
    thread({ id: "T2", line: 11, path: "src/b.ts" }),
    thread({ id: "T3", isOutdated: true, line: 12, path: "src/a.ts" }),
    thread({ id: "T4", line: null, path: "src/a.ts" }),
  ];

  deepStrictEqual(
    remoteThreadsForFilePath(threads, "src/a.ts").map((entry) => entry.id),
    ["T1"]
  );
});

test("remoteThreadLineAnnotation projects GitHub coordinates onto Pierre sides", () => {
  const annotation = remoteThreadLineAnnotation(
    thread({ id: "T1", line: 9, path: "src/a.ts", side: "LEFT" })
  );

  strictEqual(annotation?.lineNumber, 9);
  strictEqual(annotation?.side, "deletions");
  deepStrictEqual(annotation?.metadata, { kind: "remote", threadId: "T1" });
});

test("remoteThreadLineAnnotation skips outdated or unanchored threads", () => {
  strictEqual(
    remoteThreadLineAnnotation(
      thread({ id: "T1", isOutdated: true, line: 9, path: "src/a.ts" })
    ),
    undefined
  );
  strictEqual(
    remoteThreadLineAnnotation(
      thread({ id: "T2", line: null, path: "src/a.ts" })
    ),
    undefined
  );
});

test("collectDiffLineAnnotationsByFile projects a returned remote thread onto the matching file", () => {
  const fileDiff = parseSingleFile(textPatch);
  const remote = thread({ id: "THREAD_1", line: 2, path: fileDiff.name });

  const byFile = collectDiffLineAnnotationsByFile({
    draft: null,
    fileDiffs: [fileDiff],
    remoteThreads: [remote],
    scope: "committed",
    scopedAnnotations: [],
  });

  const annotations = byFile.get(fileDiff);
  strictEqual(annotations?.length, 1);
  deepStrictEqual(annotations?.[0]?.metadata, {
    kind: "remote",
    threadId: "THREAD_1",
  });
  strictEqual(annotations?.[0]?.lineNumber, 2);
  strictEqual(annotations?.[0]?.side, "additions");
});

test("resolveAnnotationRenderTarget keeps remote threads on the render path", () => {
  const remote = thread({ id: "THREAD_1", line: 2, path: "src/a.ts" });
  const target = resolveAnnotationRenderTarget(
    { kind: "remote", threadId: "THREAD_1" },
    {
      annotationsById: new Map(),
      draft: null,
      remoteThreadsById: new Map([["THREAD_1", remote]]),
    }
  );

  deepStrictEqual(target, { _tag: "remote", thread: remote });
});

test("use-changed-files-diffs wires remote threads into CodeView rendering", () => {
  const source = readFileSync(
    path.join(
      import.meta.dirname,
      "../../src/components/use-changed-files-diffs.tsx"
    ),
    "utf-8"
  );

  match(source, /githubPrReviewThreadsAtom/u);
  match(source, /collectDiffLineAnnotationsByFile/u);
  match(source, /resolveAnnotationRenderTarget/u);
  match(source, /RemoteReviewThread/u);
  match(source, /target\._tag === "remote"/u);
});

test("resolveCodeViewItem advances version when line annotations change", () => {
  const fileDiff = parseSingleFile(textPatch);
  const withoutAnnotations = resolveCodeViewItem(fileDiff, false, undefined, 0);
  const draftAnnotations = [
    {
      lineNumber: 2,
      metadata: { kind: "draft" as const },
      side: "additions" as const,
    },
  ];
  const withDraft = resolveCodeViewItem(fileDiff, false, draftAnnotations, 0);
  const withDraftAgain = resolveCodeViewItem(
    fileDiff,
    false,
    draftAnnotations,
    0
  );

  strictEqual(withoutAnnotations.version, 0);
  strictEqual(withDraft.annotations, draftAnnotations);
  // Pierre types version as optional; assert concrete published values.
  strictEqual(withDraft.version, 1);
  strictEqual(withDraftAgain, withDraft);
});

test("resolveCodeViewItem advances version when collapse state changes", () => {
  const fileDiff = parseSingleFile(textPatch);
  const expanded = resolveCodeViewItem(fileDiff, false, undefined, 0);
  const collapsed = resolveCodeViewItem(fileDiff, true, undefined, 0);
  const collapsedForced = resolveCodeViewItem(fileDiff, true, undefined, 1);

  strictEqual(expanded.version, 0);
  strictEqual(collapsed.collapsed, true);
  strictEqual(collapsed.version, 1);
  strictEqual(collapsedForced.version, 2);
});
