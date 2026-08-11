import { match, strictEqual } from "node:assert";
import { test } from "node:test";

import { Effect } from "effect";

import {
  assertPullRequestFilesComplete,
  githubPullRequestFilesApiLimit,
} from "../../src/lib/github-pull-request-files.ts";

test("assertPullRequestFilesComplete accepts a full retrieval", async () => {
  await Effect.runPromise(
    assertPullRequestFilesComplete(
      42,
      42,
      "https://github.com/owner/repo/pull/1"
    )
  );
});

test("assertPullRequestFilesComplete fails when GitHub's file cap truncates the review", async () => {
  const error = await Effect.runPromise(
    assertPullRequestFilesComplete(
      githubPullRequestFilesApiLimit,
      githubPullRequestFilesApiLimit + 25,
      "https://github.com/owner/repo/pull/9"
    ).pipe(Effect.flip)
  );

  strictEqual(error._tag, "VcsError");
  strictEqual(error.reason, "Truncated");
  match(error.message, /3025 changed files/u);
  match(error.message, /only 3000 could be retrieved/u);
  match(error.message, /owner\/repo\/pull\/9/u);
});
