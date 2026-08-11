import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import {
  buildBitbucketPullRequestFileBatches,
  pathsFromDiffGitHeader,
} from "../../src/lib/bitbucket-pull-request-batches.ts";

test("pathsFromDiffGitHeader reads unquoted git paths", () => {
  deepStrictEqual(
    pathsFromDiffGitHeader(
      "diff --git a/src/app.ts b/src/app.ts\n@@ -1 +1 @@\n"
    ),
    {
      newPath: "src/app.ts",
      oldPath: "src/app.ts",
    }
  );
});

test("buildBitbucketPullRequestFileBatches groups entries with matching patches", () => {
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

  const batches = buildBitbucketPullRequestFileBatches(
    [
      { path: "a.ts", status: "modified" },
      { path: "b.ts", status: "modified" },
    ],
    patch,
    1
  );

  strictEqual(batches.length, 2);
  deepStrictEqual(batches[0]?.entries, [{ path: "a.ts", status: "modified" }]);
  strictEqual(batches[0]?.patch.includes("diff --git a/a.ts b/a.ts"), true);
  deepStrictEqual(batches[1]?.entries, [{ path: "b.ts", status: "modified" }]);
  strictEqual(batches[1]?.patch.includes("diff --git a/b.ts b/b.ts"), true);
});
