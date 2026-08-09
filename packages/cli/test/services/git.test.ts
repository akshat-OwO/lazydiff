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

test("repositoryName is the basename of the repository root", async () => {
  const repositoryName = await Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const parent = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "lazydiff-git-parent-",
    });
    const repository = path.join(parent, "demo-repo");
    yield* fileSystem.makeDirectory(repository);
    const run = (args: readonly string[]) =>
      childProcessSpawner.string(
        ChildProcess.make("git", args, { cwd: repository })
      );

    yield* run(["init", "--initial-branch", "main"]);
    yield* fileSystem.writeFileString(
      path.join(repository, "README.md"),
      "# Demo\n"
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
      return git.repositoryName;
    }).pipe(
      Effect.provide(
        makeGitLive({
          workingDirectory: repository,
        })
      )
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

  strictEqual(repositoryName, "demo-repo");
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

test("branches can be listed, switched, and created without discarding changes", async () => {
  const result = await Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const repository = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "lazydiff-git-branches-",
    });
    const run = (args: readonly string[]) =>
      childProcessSpawner.string(
        ChildProcess.make("git", args, { cwd: repository })
      );

    yield* run(["init", "--initial-branch", "main"]);
    yield* fileSystem.writeFileString(
      path.join(repository, "README.md"),
      "initial\n"
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
    yield* run(["branch", "feature/existing"]);
    yield* fileSystem.writeFileString(
      path.join(repository, "staged.txt"),
      "staged\n"
    );
    yield* run(["add", "staged.txt"]);
    yield* fileSystem.writeFileString(
      path.join(repository, "README.md"),
      "unstaged\n"
    );
    yield* fileSystem.writeFileString(
      path.join(repository, "untracked.txt"),
      "untracked\n"
    );

    return yield* Effect.gen(function* () {
      const git = yield* Git;
      const before = yield* git.listBranches();
      const switched = yield* git.switchBranch("feature/existing");
      const statusAfterSwitch = yield* run(["status", "--porcelain"]);
      const created = yield* git.createBranch("feature/created");
      const after = yield* git.listBranches();
      const invalidError = yield* git
        .createBranch("invalid..name")
        .pipe(Effect.flip);

      return {
        after,
        before,
        created,
        invalidError,
        statusAfterSwitch,
        switched,
      };
    }).pipe(Effect.provide(makeGitLive({ workingDirectory: repository })));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

  deepStrictEqual(result.before[0], {
    current: true,
    isRemote: false,
    localName: "main",
    name: "main",
  });
  deepStrictEqual(result.switched, {
    _tag: "Branch",
    name: "feature/existing",
  });
  deepStrictEqual(result.created, {
    _tag: "Branch",
    name: "feature/created",
  });
  strictEqual(
    result.after.find(({ name }) => name === "feature/created")?.current,
    true
  );
  strictEqual(result.statusAfterSwitch.includes("M README.md"), true);
  strictEqual(result.statusAfterSwitch.includes("A  staged.txt"), true);
  strictEqual(result.statusAfterSwitch.includes("?? untracked.txt"), true);
  strictEqual(
    result.invalidError.message.includes("not a valid branch name"),
    true
  );
});

test("switchBranch creates a tracking branch for a remote-only ref", async () => {
  const result = await Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const repository = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "lazydiff-git-remote-",
    });
    const remote = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "lazydiff-git-remote-bare-",
    });
    const run = (args: readonly string[], cwd = repository) =>
      childProcessSpawner.string(ChildProcess.make("git", args, { cwd }));

    yield* run(["init", "--bare"], remote);
    yield* run(["init", "--initial-branch", "main"]);
    yield* fileSystem.writeFileString(
      path.join(repository, "README.md"),
      "initial\n"
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
    yield* run(["remote", "add", "origin", remote]);
    yield* run(["push", "-u", "origin", "main"]);
    yield* run(["branch", "feature/remote-only"]);
    yield* run(["push", "origin", "feature/remote-only"]);
    yield* run(["branch", "-D", "feature/remote-only"]);

    return yield* Effect.gen(function* () {
      const git = yield* Git;
      const before = yield* git.listBranches();
      const head = yield* git.switchBranch("origin/feature/remote-only");
      const upstream = yield* run([
        "rev-parse",
        "--abbrev-ref",
        "--symbolic-full-name",
        "@{upstream}",
      ]).pipe(Effect.map((output) => output.trim()));

      return { before, head, upstream };
    }).pipe(Effect.provide(makeGitLive({ workingDirectory: repository })));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

  deepStrictEqual(
    result.before.find(({ name }) => name === "origin/feature/remote-only"),
    {
      current: false,
      isRemote: true,
      name: "origin/feature/remote-only",
      remoteName: "origin/feature/remote-only",
    }
  );
  deepStrictEqual(result.head, {
    _tag: "Branch",
    name: "feature/remote-only",
  });
  strictEqual(result.upstream, "origin/feature/remote-only");
});

test("switchBranch leaves the current branch and files unchanged on checkout conflict", async () => {
  const result = await Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const repository = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "lazydiff-git-switch-conflict-",
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
    const filePath = path.join(repository, "tracked.txt");

    yield* run(["init", "--initial-branch", "main"]);
    yield* fileSystem.writeFileString(filePath, "initial\n");
    yield* run(["add", "tracked.txt"]);
    yield* commit("Initial commit");
    yield* run(["checkout", "-b", "feature/conflict"]);
    yield* fileSystem.writeFileString(filePath, "feature\n");
    yield* run(["add", "tracked.txt"]);
    yield* commit("Feature change");
    yield* run(["checkout", "main"]);
    yield* fileSystem.writeFileString(filePath, "local change\n");

    return yield* Effect.gen(function* () {
      const git = yield* Git;
      const checkoutError = yield* git
        .switchBranch("feature/conflict")
        .pipe(Effect.flip);
      const head = yield* git.currentBranch();
      const contents = yield* fileSystem.readFileString(filePath);

      return { checkoutError, contents, head };
    }).pipe(Effect.provide(makeGitLive({ workingDirectory: repository })));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

  strictEqual(
    result.checkoutError.message.includes("would be overwritten by checkout"),
    true
  );
  deepStrictEqual(result.head, { _tag: "Branch", name: "main" });
  strictEqual(result.contents, "local change\n");
});

test("deleteBranch deletes available local and remote refs and protects the current branch", async () => {
  const result = await Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const repository = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "lazydiff-git-delete-",
    });
    const remote = yield* fileSystem.makeTempDirectoryScoped({
      prefix: "lazydiff-git-delete-remote-",
    });
    const run = (args: readonly string[], cwd = repository) =>
      childProcessSpawner.string(ChildProcess.make("git", args, { cwd }));

    yield* run(["init", "--bare"], remote);
    yield* run(["init", "--initial-branch", "main"]);
    yield* fileSystem.writeFileString(
      path.join(repository, "README.md"),
      "initial\n"
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
    yield* run(["remote", "add", "origin", remote]);
    yield* run(["push", "-u", "origin", "main"]);
    yield* run(["branch", "feature/delete-both"]);
    yield* run(["push", "-u", "origin", "feature/delete-both"]);
    yield* run(["branch", "feature/local-only"]);

    return yield* Effect.gen(function* () {
      const git = yield* Git;
      const listed = yield* git.listBranches();
      const paired = listed.find(({ name }) => name === "feature/delete-both");
      const localOnly = listed.find(
        ({ name }) => name === "feature/local-only"
      );

      yield* git.deleteBranch({
        localName: "feature/local-only",
        target: "local",
      });
      yield* git.deleteBranch({
        localName: "feature/delete-both",
        remoteName: "origin/feature/delete-both",
        target: "both",
      });
      const currentError = yield* git
        .deleteBranch({ localName: "main", target: "local" })
        .pipe(Effect.flip);
      const localBranches = yield* run(["branch", "--format=%(refname:short)"]);
      const remoteBranches = yield* run([
        "branch",
        "--remotes",
        "--format=%(refname:short)",
      ]);

      return {
        currentError,
        localBranches,
        localOnly,
        paired,
        remoteBranches,
      };
    }).pipe(Effect.provide(makeGitLive({ workingDirectory: repository })));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise);

  deepStrictEqual(result.paired, {
    current: false,
    isRemote: false,
    localName: "feature/delete-both",
    name: "feature/delete-both",
    remoteName: "origin/feature/delete-both",
  });
  deepStrictEqual(result.localOnly, {
    current: false,
    isRemote: false,
    localName: "feature/local-only",
    name: "feature/local-only",
  });
  strictEqual(result.localBranches.includes("feature/delete-both"), false);
  strictEqual(result.localBranches.includes("feature/local-only"), false);
  strictEqual(result.remoteBranches.includes("feature/delete-both"), false);
  strictEqual(
    result.currentError.message.includes("currently checked out branch"),
    true
  );
});
