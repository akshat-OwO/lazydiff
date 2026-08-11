import { strictEqual } from "node:assert";
import { test } from "node:test";

import { Effect, Stream } from "effect";

import { Git } from "../../src/services/git.ts";
import { makePrGitLive } from "../../src/services/pr-git.ts";
import type { PullRequestSession } from "../../src/services/vcs.ts";

const filePatch = (index: number) => {
  const name = `file-${index}.ts`;
  return `diff --git a/${name} b/${name}\n--- a/${name}\n+++ b/${name}\n@@ -1 +1 @@\n-a\n+b\n`;
};

const batchOf = (start: number, count: number) => ({
  entries: Array.from({ length: count }, (_, offset) => ({
    path: `file-${start + offset}.ts`,
    status: "modified" as const,
  })),
  patch: Array.from({ length: count }, (_, offset) =>
    filePatch(start + offset)
  ).join(""),
});

const session: PullRequestSession = {
  baseRefName: "main",
  fileBatches: Stream.fromIterable([
    batchOf(0, 20),
    batchOf(20, 20),
    batchOf(40, 5),
  ]),
  headRefName: "feature/pr-review",
  number: 3,
  owner: "akshat-OwO",
  repo: "contingency",
  title: "Example pull request",
  url: "https://github.com/akshat-OwO/contingency/pull/3",
};

test("PR-backed Git service streams committed diffs progressively", async () => {
  const batches = await Effect.gen(function* () {
    const git = yield* Git;
    return yield* Stream.runCollect(git.diffBatches("committed"));
  }).pipe(
    Effect.provide(makePrGitLive(session)),
    Effect.scoped,
    Effect.runPromise
  );

  strictEqual(batches.at(0)?.reset, true);
  strictEqual(batches.at(-1)?.complete, true);

  let joined = "";

  for (const batch of batches) {
    joined = batch.reset ? batch.patch : joined + batch.patch;
  }

  const expected = Array.from({ length: 45 }, (_, index) =>
    filePatch(index)
  ).join("");

  strictEqual(joined, expected);
});

test("PR-backed Git service streams growing status snapshots", async () => {
  const snapshots = await Effect.gen(function* () {
    const git = yield* Git;
    return yield* Stream.runCollect(git.statusChanges("committed"));
  }).pipe(
    Effect.provide(makePrGitLive(session)),
    Effect.scoped,
    Effect.runPromise
  );

  strictEqual(snapshots.at(-1)?.length, 45);
});
