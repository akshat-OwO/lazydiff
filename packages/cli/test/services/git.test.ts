import { deepStrictEqual, strictEqual } from "node:assert";
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

test("Git changes are separated by scope with normalized statuses", async () => {
  const result = await Effect.gen(function* () {
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
    const commit = (message: string) =>
      run([
        "-c",
        "user.name=Lazydiff Test",
        "-c",
        "user.email=test@lazydiff.local",
        "commit",
        "-m",
        message,
      ]);

    yield* run(["init", "--initial-branch", "master"]);
    yield* fileSystem.writeFileString(
      path.join(repository, "unstaged.txt"),
      "initial\n"
    );
    yield* run(["add", "unstaged.txt"]);
    yield* commit("Initial commit");
    yield* run(["switch", "-c", "feature"]);

    yield* fileSystem.writeFileString(
      path.join(repository, "committed.txt"),
      "committed\n"
    );
    yield* run(["add", "committed.txt"]);
    yield* commit("Feature commit");

    yield* fileSystem.writeFileString(
      path.join(repository, "staged.txt"),
      "staged\n"
    );
    yield* run(["add", "staged.txt"]);
    yield* fileSystem.writeFileString(
      path.join(repository, "unstaged.txt"),
      "changed\n"
    );
    yield* fileSystem.writeFileString(
      path.join(repository, "untracked.txt"),
      "untracked\n"
    );
    const nestedDirectory = path.join(repository, "nested");
    yield* fileSystem.makeDirectory(nestedDirectory);

    return yield* Effect.gen(function* () {
      const git = yield* Git;
      return yield* Effect.all({
        committedFiles: git.changedFiles("committed"),
        committedStatuses: git.fileStatuses("committed"),
        stagedFiles: git.changedFiles("staged"),
        stagedStatuses: git.fileStatuses("staged"),
        unstagedFiles: git.changedFiles("unstaged"),
        unstagedStatuses: git.fileStatuses("unstaged"),
      });
    }).pipe(Effect.provide(makeGitLive({ workingDirectory: nestedDirectory })));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

  deepStrictEqual(result.committedFiles, ["committed.txt"]);
  deepStrictEqual(result.committedStatuses, [
    { path: "committed.txt", status: "added" },
  ]);
  deepStrictEqual(result.stagedFiles, ["staged.txt"]);
  deepStrictEqual(result.stagedStatuses, [
    { path: "staged.txt", status: "added" },
  ]);
  deepStrictEqual(result.unstagedFiles, ["unstaged.txt", "untracked.txt"]);
  deepStrictEqual(result.unstagedStatuses, [
    { path: "unstaged.txt", status: "modified" },
    { path: "untracked.txt", status: "untracked" },
  ]);
});

test("staged changes work before the first commit", async () => {
  const result = await Effect.gen(function* () {
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
      path.join(repository, "first-commit.txt"),
      "staged before HEAD exists\n"
    );
    yield* run(["add", "first-commit.txt"]);

    return yield* Effect.gen(function* () {
      const git = yield* Git;
      return yield* Effect.all({
        files: git.changedFiles("staged"),
        statuses: git.fileStatuses("staged"),
      });
    }).pipe(Effect.provide(makeGitLive({ workingDirectory: repository })));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

  deepStrictEqual(result.files, ["first-commit.txt"]);
  deepStrictEqual(result.statuses, [
    { path: "first-commit.txt", status: "added" },
  ]);
});

test("scopeDiff returns one patch covering every file in the scope", async () => {
  const result = await Effect.gen(function* () {
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
    const commit = (message: string) =>
      run([
        "-c",
        "user.name=Lazydiff Test",
        "-c",
        "user.email=test@lazydiff.local",
        "commit",
        "-m",
        message,
      ]);

    yield* run(["init", "--initial-branch", "main"]);
    yield* fileSystem.writeFileString(
      path.join(repository, "tracked.txt"),
      "first\n"
    );
    yield* run(["add", "tracked.txt"]);
    yield* commit("Initial commit");
    yield* run(["switch", "-c", "feature"]);

    yield* fileSystem.writeFileString(
      path.join(repository, "committed.txt"),
      "committed\n"
    );
    yield* run(["add", "committed.txt"]);
    yield* commit("Feature commit");

    yield* fileSystem.writeFileString(
      path.join(repository, "staged.txt"),
      "staged\n"
    );
    yield* run(["add", "staged.txt"]);
    yield* fileSystem.writeFileString(
      path.join(repository, "tracked.txt"),
      "second\n"
    );
    yield* fileSystem.writeFileString(
      path.join(repository, "untracked.txt"),
      "untracked\n"
    );

    return yield* Effect.gen(function* () {
      const git = yield* Git;

      return yield* Effect.all({
        committed: git.scopeDiff("committed"),
        staged: git.scopeDiff("staged"),
        unstaged: git.scopeDiff("unstaged"),
      });
    }).pipe(Effect.provide(makeGitLive({ workingDirectory: repository })));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

  // The unstaged patch covers the tracked edit and the untracked file, which
  // has no index entry to diff against.
  strictEqual(result.unstaged.includes("diff --git a/tracked.txt"), true);
  strictEqual(result.unstaged.includes("-first"), true);
  strictEqual(result.unstaged.includes("+second"), true);
  strictEqual(result.unstaged.includes("diff --git a/untracked.txt"), true);
  strictEqual(result.unstaged.includes("--- /dev/null"), true);
  strictEqual(result.unstaged.includes("+untracked"), true);
  strictEqual(result.unstaged.includes("staged.txt"), false);

  strictEqual(result.staged.includes("diff --git a/staged.txt"), true);
  strictEqual(result.staged.includes("+staged"), true);
  strictEqual(result.staged.includes("tracked.txt"), false);

  strictEqual(result.committed.includes("diff --git a/committed.txt"), true);
  strictEqual(result.committed.includes("+committed"), true);
  strictEqual(result.committed.includes("staged.txt"), false);
});

test("scopeDiff output is independent of repository display settings", async () => {
  const result = await Effect.gen(function* () {
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
    // These settings reshape Git output even when it is piped: ANSI escapes
    // around patch headers, and octal escapes for non-ASCII pathnames. The
    // specific `color.diff` key overrides the general `color.ui` default.
    yield* run(["config", "color.ui", "always"]);
    yield* run(["config", "color.diff", "always"]);
    yield* run(["config", "core.quotePath", "true"]);
    yield* fileSystem.writeFileString(path.join(repository, "ünïcode.txt"), "");
    yield* run(["add", "ünïcode.txt"]);
    yield* run([
      "-c",
      "user.name=Lazydiff Test",
      "-c",
      "user.email=test@lazydiff.local",
      "commit",
      "-m",
      "Initial commit",
    ]);
    yield* fileSystem.writeFileString(
      path.join(repository, "ünïcode.txt"),
      "changed\n"
    );

    return yield* Effect.gen(function* () {
      const git = yield* Git;

      return yield* Effect.all({
        patch: git.scopeDiff("unstaged"),
        statuses: git.fileStatuses("unstaged"),
      });
    }).pipe(Effect.provide(makeGitLive({ workingDirectory: repository })));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

  strictEqual(result.patch.includes("\u001B["), false);
  strictEqual(result.patch.startsWith("diff --git "), true);
  // The patch has to name files exactly as the status entries do, otherwise the
  // web UI cannot match a diff to the file it came from.
  deepStrictEqual(result.statuses, [
    { path: "ünïcode.txt", status: "modified" },
  ]);
  strictEqual(
    result.patch.includes("diff --git a/ünïcode.txt b/ünïcode.txt"),
    true
  );
});

test("changedFiles prefers main when both default branches exist", async () => {
  const files = await Effect.gen(function* () {
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
    const commit = (message: string) =>
      run([
        "-c",
        "user.name=Lazydiff Test",
        "-c",
        "user.email=test@lazydiff.local",
        "commit",
        "-m",
        message,
      ]);

    yield* run(["init", "--initial-branch", "master"]);
    yield* fileSystem.writeFileString(
      path.join(repository, "base.txt"),
      "base\n"
    );
    yield* run(["add", "base.txt"]);
    yield* commit("Initial commit");
    yield* run(["switch", "-c", "main"]);
    yield* fileSystem.writeFileString(
      path.join(repository, "main-only.txt"),
      "main\n"
    );
    yield* run(["add", "main-only.txt"]);
    yield* commit("Main commit");
    yield* run(["switch", "-c", "feature"]);

    return yield* Effect.gen(function* () {
      const git = yield* Git;
      return yield* git.changedFiles("committed");
    }).pipe(Effect.provide(makeGitLive({ workingDirectory: repository })));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

  deepStrictEqual(files, []);
});
