import { deepStrictEqual } from "node:assert";
import { test } from "node:test";

import { NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { Git, makeGitLive } from "../../src/services/git.ts";

test("currentBranch represents branch and detached HEAD states", async () => {
  const states = await Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const repository = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "lazydiff-git-test-",
    });
    const run = (args: readonly string[]) =>
      childProcessSpawner.string(
        ChildProcess.make("git", args, { cwd: repository })
      );

    yield* run(["init", "--initial-branch", "main"]);
    yield* fileSystem.writeFileString(
      path.join(repository, "README.md"),
      "# Test repository\n"
    );
    yield* run(["add", "README.md"]);
    yield* run([
      "-c",
      "user.name=Lazydiff Test",
      "-c",
      "user.email=test@lazydiff.local",
      "commit",
      "-m",
      "Initial commit",
    ]);

    return yield* Effect.gen(function* () {
      const git = yield* Git;
      const branch = yield* git.currentBranch();

      yield* run(["checkout", "--detach"]);
      const detached = yield* git.currentBranch();
      const commit = yield* run(["rev-parse", "--short", "HEAD"]).pipe(
        Effect.map((output) => output.trim())
      );

      return { branch, commit, detached };
    }).pipe(
      Effect.provide(
        makeGitLive({
          workingDirectory: repository,
        })
      )
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

  deepStrictEqual(states.branch, { _tag: "Branch", name: "main" });
  deepStrictEqual(states.detached, {
    _tag: "Detached",
    commit: states.commit,
  });
});
