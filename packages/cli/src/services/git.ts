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
            args,
            cwd === undefined ? undefined : { cwd }
          )
        )
    );
    const repositoryRoot = yield* runFrom(
      ["rev-parse", "--show-toplevel"],
      workingDirectory
    ).pipe(Effect.map((output) => output.trim()));
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
          "HEAD",
          "--",
        ]).pipe(Effect.flatMap(parseGitStatus), Effect.map(sortStatusEntries))
    );

    const committedStatuses = Effect.fn(
      "lazydiff/services/git/committedStatuses"
    )((branch?: string) =>
      Effect.gen(function* () {
        const baseCommit = yield* branch === undefined
          ? resolveDefaultBranch()
          : resolveCommit(branch);
        const comparisonBase = yield* run([
          "merge-base",
          baseCommit,
          "HEAD",
        ]).pipe(
          Effect.map((output) => output.trim()),
          Effect.flatMap((commit) =>
            commit.length > 0
              ? Effect.succeed(commit)
              : Effect.fail(
                  new Error("The compared branches have no common ancestor")
                )
          )
        );
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
    };
  });

type GitShape = Effect.Success<ReturnType<typeof make>>;

export const Git = Context.Service<GitShape>("lazydiff/services/git");

export const makeGitLive = (options?: { readonly workingDirectory?: string }) =>
  Layer.effect(Git, make(options?.workingDirectory));

export const GitLive = makeGitLive();
