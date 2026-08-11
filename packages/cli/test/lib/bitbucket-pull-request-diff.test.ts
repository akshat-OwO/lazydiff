import { match, strictEqual } from "node:assert";
import { test } from "node:test";

import { Effect } from "effect";

import {
  assertBitbucketPullRequestDiffComplete,
  bitbucketPullRequestDiffFileChangedLinesApiLimit,
  bitbucketPullRequestDiffFilesApiLimit,
  countUnifiedPatchChangedLines,
  isBinaryPatchFragment,
} from "../../src/lib/bitbucket-pull-request-diff.ts";

test("countUnifiedPatchChangedLines ignores file headers", () => {
  strictEqual(
    countUnifiedPatchChangedLines(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-a
+b
`),
    2
  );
});

test("isBinaryPatchFragment detects binary markers", () => {
  strictEqual(
    isBinaryPatchFragment(
      "diff --git a/icon.png b/icon.png\nBinary files a/icon.png and b/icon.png differ\n"
    ),
    true
  );
});

test("assertBitbucketPullRequestDiffComplete accepts matching text and binary fragments", async () => {
  const patch = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-a
+b
diff --git a/icon.png b/icon.png
Binary files a/icon.png and b/icon.png differ
`;

  await Effect.runPromise(
    assertBitbucketPullRequestDiffComplete(
      [
        {
          linesAdded: 1,
          linesRemoved: 1,
          path: "a.ts",
          status: "modified",
        },
        {
          linesAdded: 0,
          linesRemoved: 0,
          path: "icon.png",
          status: "modified",
        },
      ],
      patch,
      "https://bitbucket.org/acme/demo/pull-requests/1"
    )
  );
});

test("assertBitbucketPullRequestDiffComplete fails when aggregate diff omits files", async () => {
  const patch = `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-a
+b
`;

  const error = await Effect.runPromise(
    assertBitbucketPullRequestDiffComplete(
      [
        {
          linesAdded: 1,
          linesRemoved: 1,
          path: "a.ts",
          status: "modified",
        },
        {
          linesAdded: 1,
          linesRemoved: 0,
          path: "missing.ts",
          status: "added",
        },
      ],
      patch,
      "https://bitbucket.org/acme/demo/pull-requests/9"
    ).pipe(Effect.flip)
  );

  strictEqual(error._tag, "VcsError");
  strictEqual(error.reason, "Truncated");
  match(error.message, /missing\.ts/u);
  match(error.message, /acme\/demo\/pull-requests\/9/u);
  match(
    error.message,
    new RegExp(String(bitbucketPullRequestDiffFilesApiLimit), "u")
  );
});

test("assertBitbucketPullRequestDiffComplete fails when a text fragment is truncated", async () => {
  const patch = `diff --git a/big.ts b/big.ts
--- a/big.ts
+++ b/big.ts
@@ -1 +1 @@
-a
+b
`;

  const error = await Effect.runPromise(
    assertBitbucketPullRequestDiffComplete(
      [
        {
          linesAdded: 1500,
          linesRemoved: 1500,
          path: "big.ts",
          status: "modified",
        },
      ],
      patch,
      "https://bitbucket.org/acme/demo/pull-requests/12"
    ).pipe(Effect.flip)
  );

  strictEqual(error._tag, "VcsError");
  strictEqual(error.reason, "Truncated");
  match(error.message, /truncated diff for big\.ts/u);
  match(error.message, /3000 changed lines/u);
  match(error.message, /only includes 2/u);
  match(
    error.message,
    new RegExp(String(bitbucketPullRequestDiffFileChangedLinesApiLimit), "u")
  );
});
