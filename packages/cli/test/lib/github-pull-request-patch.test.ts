import { match, strictEqual } from "node:assert";
import { test } from "node:test";

import {
  buildUnifiedPatchFromGithubFile,
  buildUnifiedPatchFromGithubFiles,
} from "../../src/lib/github-pull-request-patch.ts";

test("buildUnifiedPatchFromGithubFiles assembles added, modified, and deleted files", () => {
  const patch = buildUnifiedPatchFromGithubFiles([
    {
      filename: "new.sh",
      patch: "@@ -0,0 +1,2 @@\n+#!/bin/bash\n+echo hi\n",
      status: "added",
    },
    {
      filename: "readme.md",
      patch: "@@ -1 +1 @@\n-old\n+new\n",
      status: "modified",
    },
    {
      filename: "gone.md",
      patch: "@@ -1 +0,0 @@\n-bye\n",
      status: "removed",
    },
    {
      filename: "empty.lock",
      status: "added",
    },
  ]);

  match(patch, /^diff --git a\/new\.sh b\/new\.sh$/mu);
  match(patch, /^new file mode 100644$/mu);
  match(patch, /\+echo hi/u);
  match(patch, /^diff --git a\/readme\.md b\/readme\.md$/mu);
  match(patch, /^-old$/mu);
  match(patch, /^\+new$/mu);
  match(patch, /^diff --git a\/gone\.md b\/gone\.md$/mu);
  match(patch, /^deleted file mode 100644$/mu);
  match(patch, /^diff --git a\/empty\.lock b\/empty\.lock$/mu);
  strictEqual(patch.endsWith("\n"), true);
});

test("buildUnifiedPatchFromGithubFile quotes paths that need git escaping", () => {
  const patch = buildUnifiedPatchFromGithubFile({
    filename: "path with spaces.txt",
    patch: "@@ -0,0 +1 @@\n+hi\n",
    status: "added",
  });

  match(
    patch,
    /^diff --git "a\/path with spaces\.txt" "b\/path with spaces\.txt"$/mu
  );
});

test("buildUnifiedPatchFromGithubFiles emits pure renames without hunks", () => {
  const patch = buildUnifiedPatchFromGithubFiles([
    {
      filename: "new-name.ts",
      previous_filename: "old-name.ts",
      status: "renamed",
    },
  ]);

  match(patch, /^diff --git a\/old-name\.ts b\/new-name\.ts$/mu);
  match(patch, /^similarity index 100%$/mu);
  match(patch, /^rename from old-name\.ts$/mu);
  match(patch, /^rename to new-name\.ts$/mu);
  strictEqual(patch.includes("@@"), false);
});
