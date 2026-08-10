import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { test } from "node:test";

import { Effect, Option, Stream } from "effect";

import { Git } from "../../src/services/git.ts";
import { makePrGitLive } from "../../src/services/pr-git.ts";
import type { PullRequestSession } from "../../src/services/vcs.ts";

const patch = "diff --git a/README.md b/README.md\n";

const session: PullRequestSession = {
  baseRefName: "main",
  fileBatches: Stream.succeed({
    entries: [
      { path: "README.md", status: "modified" as const },
      { path: "src/new.ts", status: "added" as const },
    ],
    patch,
  }),
  headRefName: "feature/pr-review",
  number: 3,
  owner: "akshat-OwO",
  repo: "contingency",
  title: "Example pull request",
  url: "https://github.com/akshat-OwO/contingency/pull/3",
};

test("PR-backed Git service exposes committed pull request changes", async () => {
  const result = await Effect.gen(function* () {
    const git = yield* Git;
    // Drain the batch stream so the background loader has cached every file.
    yield* Stream.runDrain(git.diffBatches("committed"));

    return {
      branches: yield* git.listBranches(),
      committedDiff: yield* git.scopeDiff("committed"),
      committedFiles: yield* git.changedFiles("committed"),
      committedStatuses: yield* git.fileStatuses("committed"),
      currentBranch: yield* git.currentBranch(),
      repositoryName: git.repositoryName,
      reviewSource: git.reviewSource,
      unstagedDiff: yield* git.scopeDiff("unstaged"),
      unstagedStatuses: yield* git.fileStatuses("unstaged"),
    };
  }).pipe(
    Effect.provide(makePrGitLive(session)),
    Effect.scoped,
    Effect.runPromise
  );

  deepStrictEqual(result.currentBranch, {
    _tag: "Branch",
    name: "feature/pr-review",
  });
  strictEqual(result.repositoryName, "akshat-OwO/contingency#3");
  strictEqual(result.reviewSource, "pull-request");
  deepStrictEqual(result.committedFiles, ["README.md", "src/new.ts"]);
  deepStrictEqual(result.committedStatuses, [
    { path: "README.md", status: "modified" },
    { path: "src/new.ts", status: "added" },
  ]);
  strictEqual(result.committedDiff, patch);
  deepStrictEqual(result.unstagedStatuses, []);
  strictEqual(result.unstagedDiff, "");
  deepStrictEqual(
    result.branches.map(({ current, name }) => ({ current, name })),
    [
      { current: true, name: "feature/pr-review" },
      { current: false, name: "main" },
    ]
  );
});

test("PR-backed Git service rejects branch mutations", async () => {
  await rejects(() =>
    Effect.gen(function* () {
      const git = yield* Git;
      yield* git.switchBranch("main");
    }).pipe(
      Effect.provide(makePrGitLive(session)),
      Effect.scoped,
      Effect.runPromise
    )
  );
});

test("PR-backed Git service keeps branch watchers open", async () => {
  const head = await Effect.gen(function* () {
    const git = yield* Git;
    return yield* Stream.runHead(git.branchChanges);
  }).pipe(
    Effect.provide(makePrGitLive(session)),
    Effect.scoped,
    Effect.runPromise
  );

  deepStrictEqual(
    head,
    Option.some({ _tag: "Branch", name: "feature/pr-review" })
  );
});
