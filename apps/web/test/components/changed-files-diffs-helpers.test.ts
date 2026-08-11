import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import type { GithubPrReviewThread } from "@lazydiff/protocol";

import {
  remoteThreadLineAnnotation,
  remoteThreadsForFilePath,
} from "../../src/components/changed-files-diffs-helpers.ts";

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
