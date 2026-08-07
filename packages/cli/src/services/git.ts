import type {
  GitChangeScope,
  GitFileStatus,
  GitHead,
  GitStatusEntry,
} from "@lazydiff/protocol";
import {
  Context,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Path,
  Schedule,
  Stream,
  SubscriptionRef,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const maximumRetryDelay = Duration.seconds(5);

/**
 * Repository configuration must not change how output is parsed. Colour would
 * wrap patch headers in ANSI escapes, and `color.diff` has to be disabled
 * alongside the general `color.ui` default because the specific key wins.
 * `core.quotePath` would escape non-ASCII pathnames in patch headers while `-z`
 * status output keeps them raw.
 */
const machineReadableConfig = [
  "-c",
  "color.ui=false",
  "-c",
  "color.diff=false",
  "-c",
  "core.quotePath=false",
];

/** Git resolves this path to an empty blob on every supported platform. */
const nullDevice = "/dev/null";

/** Bounds the extra `git diff` processes spawned for untracked files. */
const untrackedDiffConcurrency = 8;

const joinPatches = (patches: readonly string[]) =>
  patches
    .filter((patch) => patch.length > 0)
    .map((patch) => (patch.endsWith("\n") ? patch : `${patch}\n`))
    .join("");

const watcherRetrySchedule = Schedule.exponential("100 millis").pipe(
  Schedule.jittered,
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(Duration.min(duration, maximumRetryDelay))
  )
);

const branchHead = (name: string): GitHead => ({ _tag: "Branch", name });

const detachedHead = (commit: string): GitHead => ({
  _tag: "Detached",
  commit,
});

const parseNullSeparatedPaths = (output: string) =>
  output.split("\0").filter((file) => file.length > 0);

const statusFromCode = (code: string): GitFileStatus | undefined => {
  switch (code) {
    case "A":
    case "C": {
      return "added";
    }
    case "D": {
      return "deleted";
    }
    case "R": {
      return "renamed";
    }
    case "M":
    case "T":
    case "U":
    case "X":
    case "B": {
      return "modified";
    }
    default: {
      return undefined;
    }
  }
};

const parseGitStatus = Effect.fn("lazydiff/services/git/parseGitStatus")(
  (output: string) =>
    Effect.gen(function* () {
      const fields = parseNullSeparatedPaths(output);
      const entries: GitStatusEntry[] = [];

      for (let index = 0; index < fields.length;) {
        const statusCode = fields[index];
        const status =
          statusCode === undefined
            ? undefined
            : statusFromCode(statusCode[0] ?? "");

        if (statusCode === undefined || status === undefined) {
          return yield* Effect.fail(
            new Error(`Unsupported Git status record: ${statusCode ?? "empty"}`)
          );
        }

        const isRenameOrCopy =
          statusCode.startsWith("R") || statusCode.startsWith("C");
        const pathIndex = index + (isRenameOrCopy ? 2 : 1);
        const filePath = fields[pathIndex];

        if (filePath === undefined) {
          return yield* Effect.fail(
            new Error(`Missing path for Git status: ${statusCode}`)
          );
        }

        entries.push({ path: filePath, status });
        index += isRenameOrCopy ? 3 : 2;
      }

      return entries;
    })
);

const sortStatusEntries = (entries: readonly GitStatusEntry[]) =>
  [...entries].toSorted((left, right) => left.path.localeCompare(right.path));

const headsAreEqual = (left: GitHead, right: GitHead) => {
  if (left._tag === "Branch" && right._tag === "Branch") {
    return left.name === right.name;
  }

  if (left._tag === "Detached" && right._tag === "Detached") {
    return left.commit === right.commit;
  }

  return false;
};

const make = (workingDirectory?: string) =>
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const runFrom = Effect.fn("lazydiff/services/git/runFrom")(
      (args: readonly string[], cwd?: string) =>
        childProcessSpawner.string(
          ChildProcess.make(
            "git",
            [...machineReadableConfig, ...args],
            cwd === undefined ? undefined : { cwd }
          )
        )
    );
    const repositoryRoot = yield* runFrom(
      ["rev-parse", "--show-toplevel"],
      workingDirectory
    ).pipe(Effect.map((output) => output.trim()));
    const repositoryName =
      path.basename(repositoryRoot) || repositoryRoot || "repository";
    const run = Effect.fn("lazydiff/services/git/run")(
      (args: readonly string[]) => runFrom(args, repositoryRoot)
    );

    const currentBranch = Effect.fn("lazydiff/services/git/currentBranch")(() =>
      run(["branch", "--show-current"]).pipe(
        Effect.map((output) => output.trim()),
        Effect.flatMap((branch) =>
          branch.length > 0
            ? Effect.succeed(branchHead(branch))
            : run(["rev-parse", "--short", "HEAD"]).pipe(
                Effect.map((output) => detachedHead(output.trim()))
              )
        )
      )
    );

    const resolveCommit = Effect.fn("lazydiff/services/git/resolveCommit")(
      (branch: string) =>
        run([
          "rev-parse",
          "--verify",
          "--quiet",
          `refs/heads/${branch}^{commit}`,
        ]).pipe(
          Effect.map((output) => output.trim()),
          Effect.flatMap((commit) =>
            commit.length > 0
              ? Effect.succeed(commit)
              : Effect.fail(new Error(`Git branch not found: ${branch}`))
          )
        )
    );

    const resolveDefaultBranch = Effect.fn(
      "lazydiff/services/git/resolveDefaultBranch"
    )(() =>
      run([
        "rev-parse",
        "--verify",
        "--quiet",
        "refs/heads/main^{commit}",
      ]).pipe(
        Effect.map((output) => output.trim()),
        Effect.flatMap((mainCommit) =>
          mainCommit.length > 0
            ? Effect.succeed(mainCommit)
            : resolveCommit("master")
        )
      )
    );

    const unstagedStatuses = Effect.fn(
      "lazydiff/services/git/unstagedStatuses"
    )(() =>
      Effect.gen(function* () {
        const [trackedOutput, untrackedOutput] = yield* Effect.all(
          [
            run(["diff", "--name-status", "-z", "--find-renames", "--"]),
            run(["ls-files", "--others", "--exclude-standard", "-z"]),
          ],
          { concurrency: "unbounded" }
        );
        const trackedEntries = yield* parseGitStatus(trackedOutput);
        const untrackedEntries = parseNullSeparatedPaths(untrackedOutput).map(
          (filePath): GitStatusEntry => ({
            path: filePath,
            status: "untracked",
          })
        );

        return sortStatusEntries([...trackedEntries, ...untrackedEntries]);
      })
    );

    const stagedStatuses = Effect.fn("lazydiff/services/git/stagedStatuses")(
      () =>
        run([
          "diff",
          "--cached",
          "--name-status",
          "-z",
          "--find-renames",
          "--",
        ]).pipe(Effect.flatMap(parseGitStatus), Effect.map(sortStatusEntries))
    );

    const resolveComparisonBase = Effect.fn(
      "lazydiff/services/git/resolveComparisonBase"
    )((branch?: string) =>
      Effect.gen(function* () {
        const baseCommit = yield* branch === undefined
          ? resolveDefaultBranch()
          : resolveCommit(branch);

        return yield* run(["merge-base", baseCommit, "HEAD"]).pipe(
          Effect.map((output) => output.trim()),
          Effect.flatMap((commit) =>
            commit.length > 0
              ? Effect.succeed(commit)
              : Effect.fail(
                  new Error("The compared branches have no common ancestor")
                )
          )
        );
      })
    );

    const committedStatuses = Effect.fn(
      "lazydiff/services/git/committedStatuses"
    )((branch?: string) =>
      Effect.gen(function* () {
        const comparisonBase = yield* resolveComparisonBase(branch);
        const output = yield* run([
          "diff",
          "--name-status",
          "-z",
          "--find-renames",
          comparisonBase,
          "HEAD",
          "--",
        ]);
        const entries = yield* parseGitStatus(output);

        return sortStatusEntries(entries);
      })
    );

    const fileStatuses = Effect.fn("lazydiff/services/git/fileStatuses")((
      scope: GitChangeScope,
      branch?: string
    ) => {
      if (scope === "unstaged") {
        return unstagedStatuses();
      }

      if (scope === "staged") {
        return stagedStatuses();
      }

      return committedStatuses(branch);
    });

    const changedFiles = Effect.fn("lazydiff/services/git/changedFiles")(
      (scope: GitChangeScope, branch?: string) =>
        fileStatuses(scope, branch).pipe(
          Effect.map((entries) => entries.map(({ path: filePath }) => filePath))
        )
    );

    const unstagedDiff = Effect.fn("lazydiff/services/git/unstagedDiff")(() =>
      Effect.gen(function* () {
        const [trackedPatch, entries] = yield* Effect.all(
          [run(["diff", "--find-renames", "--"]), unstagedStatuses()],
          { concurrency: "unbounded" }
        );
        // Untracked files have no index entry to diff against, so each one is
        // compared with an empty file instead.
        const untrackedPatches = yield* Effect.all(
          entries
            .filter(({ status }) => status === "untracked")
            .map(({ path: filePath }) =>
              run(["diff", "--no-index", "--", nullDevice, filePath])
            ),
          { concurrency: untrackedDiffConcurrency }
        );

        return joinPatches([trackedPatch, ...untrackedPatches]);
      })
    );

    /** Resolves the unified patch covering every changed file in the scope. */
    const scopeDiff = Effect.fn("lazydiff/services/git/scopeDiff")((
      scope: GitChangeScope,
      branch?: string
    ) => {
      if (scope === "unstaged") {
        return unstagedDiff();
      }

      if (scope === "staged") {
        return run(["diff", "--cached", "--find-renames", "--"]).pipe(
          Effect.map((patch) => joinPatches([patch]))
        );
      }

      return resolveComparisonBase(branch).pipe(
        Effect.flatMap((comparisonBase) =>
          run(["diff", "--find-renames", comparisonBase, "HEAD", "--"])
        ),
        Effect.map((patch) => joinPatches([patch]))
      );
    });

    const gitDirectory = yield* run(["rev-parse", "--absolute-git-dir"]).pipe(
      Effect.map((output) => output.trim())
    );
    const repositoryChanges = fileSystem
      .watch(repositoryRoot)
      .pipe(
        Stream.debounce(Duration.millis(50)),
        Stream.retry(watcherRetrySchedule)
      );
    const initialBranch = yield* currentBranch();
    const branchState = yield* SubscriptionRef.make(initialBranch);

    const publishBranchChange = (head: GitHead) =>
      SubscriptionRef.get(branchState).pipe(
        Effect.flatMap((current) =>
          headsAreEqual(current, head)
            ? Effect.void
            : SubscriptionRef.set(branchState, head)
        )
      );

    const watchBranchChanges = Effect.gen(function* () {
      yield* currentBranch().pipe(Effect.flatMap(publishBranchChange));

      yield* fileSystem.watch(gitDirectory).pipe(
        Stream.filter((event) => path.basename(event.path) === "HEAD"),
        Stream.debounce(Duration.millis(25)),
        Stream.mapEffect(() => currentBranch()),
        Stream.runForEach(publishBranchChange)
      );
    });

    yield* watchBranchChanges.pipe(
      Effect.tapError((error) =>
        Effect.logWarning("Git branch watcher failed; retrying", error)
      ),
      Effect.retry(watcherRetrySchedule),
      Effect.forkScoped({ startImmediately: true })
    );

    return {
      branchChanges: SubscriptionRef.changes(branchState),
      changedFiles,
      currentBranch,
      fileStatuses,
      repositoryChanges,
      repositoryName,
      scopeDiff,
    };
  });

type GitShape = Effect.Success<ReturnType<typeof make>>;

export const Git = Context.Service<GitShape>("lazydiff/services/git");

export const makeGitLive = (options?: { readonly workingDirectory?: string }) =>
  Layer.effect(Git, make(options?.workingDirectory));

export const GitLive = makeGitLive();
