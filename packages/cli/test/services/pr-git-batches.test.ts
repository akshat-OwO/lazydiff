import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { Effect, Stream } from "effect";

import { Git } from "../../src/services/git.ts";
import { makePrGitLive } from "../../src/services/pr-git.ts";
import type { PullRequestReview } from "../../src/services/vcs.ts";

const multiFilePatch = Array.from({ length: 45 }, (_, index) => {
  const name = `file-${index}.ts`;
  return `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n-a\n+b\n`;
}).join("");

const pullRequest: PullRequestReview = {
  baseRefName: "main",
  entries: Array.from({ length: 45 }, (_, index) => ({
    path: `file-${index}.ts`,
    status: "modified" as const,
  })),
  headRefName: "feature/pr-review",
  number: 3,
  owner: "akshat-OwO",
  patch: multiFilePatch,
  repo: "contingency",
  title: "Example pull request",
  url: "https://github.com/akshat-OwO/contingency/pull/3",
};

test("PR-backed Git service streams committed diffs in batches of 20", async () => {
  const batches = await Effect.gen(function* () {
    const git = yield* Git;
    return yield* Stream.runCollect(git.scopeDiffBatches("committed"));
  }).pipe(Effect.provide(makePrGitLive(pullRequest)), Effect.runPromise);

  strictEqual(batches.length, 3);
  strictEqual(batches[0]?.reset, true);
  strictEqual(batches[0]?.complete, false);
  strictEqual(batches[1]?.reset, false);
  strictEqual(batches[2]?.complete, true);
  let joined = "";

  for (const batch of batches) {
    joined = batch.reset ? batch.patch : joined + batch.patch;
  }

  deepStrictEqual(joined, multiFilePatch);
});
