import { match, strictEqual } from "node:assert";
import { test } from "node:test";

import { Effect } from "effect";

import {
  assertBitbucketPullRequestDiffComplete,
  bitbucketPullRequestDiffFilesApiLimit,
} from "../../src/lib/bitbucket-pull-request-diff.ts";

test("assertBitbucketPullRequestDiffComplete accepts matching fragments", async () => {
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
        { path: "a.ts", status: "modified" },
        { path: "icon.png", status: "modified" },
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
        { path: "a.ts", status: "modified" },
        { path: "missing.ts", status: "added" },
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
