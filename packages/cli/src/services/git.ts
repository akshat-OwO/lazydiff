import type {
  GitBranch,
  GitBranchDeleteTarget,
  GitChangeScope,
  GitFileStatus,
  GitHead,
  GitReviewSource,
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
  Semaphore,
  Stream,
  SubscriptionRef,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  chunkItems,
  diffBatchSize,
  joinPatchFragments,
} from "@/lib/diff-batches";
import type { DiffBatch } from "@/lib/diff-batches";

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

const gitCommandTimeout = Duration.seconds(30);

const joinPatches = joinPatchFragments;

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

/**
 * Status rows used for scoped diffs. Renames/copies keep the source path so
 * pathspecs can include both sides; protocol-facing entries drop it.
 */
interface ParsedGitStatusEntry extends GitStatusEntry {
  readonly previousPath?: string;
}

const parseGitStatus = Effect.fn("lazydiff/services/git/parseGitStatus")(
  (output: string) =>
    Effect.gen(function* () {
      const fields = parseNullSeparatedPaths(output);
      const entries: ParsedGitStatusEntry[] = [];

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

        if (isRenameOrCopy) {
          const previousPath = fields[index + 1];
          const filePath = fields[index + 2];

          if (previousPath === undefined || filePath === undefined) {
            return yield* Effect.fail(
              new Error(`Missing path for Git status: ${statusCode}`)
            );
          }

          entries.push({ path: filePath, previousPath, status });
          index += 3;
          continue;
        }

        const filePath = fields[index + 1];

        if (filePath === undefined) {
          return yield* Effect.fail(
            new Error(`Missing path for Git status: ${statusCode}`)
          );
        }

        entries.push({ path: filePath, status });
        index += 2;
      }

      return entries;
    })
);

const sortStatusEntries = <Entry extends GitStatusEntry>(
  entries: readonly Entry[]
) =>
  [...entries].toSorted((left, right) => left.path.localeCompare(right.path));

/** Pathspecs must name both rename/copy sides or Git emits a new-file diff. */
const pathspecsForEntries = (entries: readonly ParsedGitStatusEntry[]) => {
  const paths: string[] = [];

  for (const entry of entries) {
    if (entry.previousPath !== undefined) {
      paths.push(entry.previousPath);
    }

    paths.push(entry.path);
  }

  return paths;
};

const toProtocolStatusEntries = (
  entries: readonly ParsedGitStatusEntry[]
): GitStatusEntry[] =>
  entries.map(({ path: filePath, status }) => ({ path: filePath, status }));

const headsAreEqual = (left: GitHead, right: GitHead) => {
  if (left._tag === "Branch" && right._tag === "Branch") {
    return left.name === right.name;
  }

  if (left._tag === "Detached" && right._tag === "Detached") {
    return left.commit === right.commit;
  }

  return false;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const toError = (error: unknown) => new Error(errorMessage(error));

interface BranchWithRecency {
  readonly branch: GitBranch;
  readonly lastCommit: number;
}

interface LocalBranchWithRecency {
  readonly current: boolean;
  readonly lastCommit: number;
  readonly name: string;
  readonly upstream: string | undefined;
}

const byCurrentRecencyAndName = (
  left: BranchWithRecency,
  right: BranchWithRecency
) => {
  if (left.branch.current !== right.branch.current) {
    return left.branch.current ? -1 : 1;
  }

  return left.lastCommit === right.lastCommit
    ? left.branch.name.localeCompare(right.branch.name)
    : right.lastCommit - left.lastCommit;
};

const remoteCheckoutArgs = (
  name: string,
  trackingBranch: string | undefined,
  localCandidateExists: boolean
): readonly string[] => {
  if (trackingBranch !== undefined) {
    return ["checkout", trackingBranch];
  }

  if (localCandidateExists) {
    return ["checkout", name];
  }

  return ["checkout", "--track", name];
};

const parseRemoteBranch = (name: string, remoteNames: readonly string[]) => {
  const remote = remoteNames
    .toSorted((left, right) => right.length - left.length)
    .find((candidate) => name.startsWith(`${candidate}/`));

  return remote === undefined
    ? undefined
    : { branch: name.slice(remote.length + 1), remote };
};

const matchingRemoteName = (
  localBranch: LocalBranchWithRecency,
  remoteBranches: readonly BranchWithRecency[],
  remoteNames: readonly string[]
) => {
  const availableRemoteNames = new Set(
    remoteBranches.map(({ branch }) => branch.name)
  );

  if (
    localBranch.upstream !== undefined &&
    availableRemoteNames.has(localBranch.upstream)
  ) {
    return localBranch.upstream;
  }

  const originName = `origin/${localBranch.name}`;

  if (availableRemoteNames.has(originName)) {
    return originName;
  }

  return remoteBranches.find(({ branch }) => {
    const parsed = parseRemoteBranch(branch.name, remoteNames);
    return parsed?.branch === localBranch.name;
  })?.branch.name;
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
    const runResult = Effect.fn("lazydiff/services/git/runResult")(
      (args: readonly string[]) =>
        Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* childProcessSpawner.spawn(
              ChildProcess.make("git", [...machineReadableConfig, ...args], {
                cwd: repositoryRoot,
              })
            );
            const result = yield* Effect.all(
              {
                exitCode: handle.exitCode,
                stderr: Stream.mkString(Stream.decodeText(handle.stderr)),
                stdout: Stream.mkString(Stream.decodeText(handle.stdout)),
              },
              { concurrency: "unbounded" }
            );

            return result;
          })
        ).pipe(Effect.timeout(gitCommandTimeout), Effect.mapError(toError))
    );
    const runChecked = Effect.fn("lazydiff/services/git/runChecked")(
      (args: readonly string[]) =>
        runResult(args).pipe(
          Effect.flatMap(({ exitCode, stderr, stdout }) =>
            exitCode === 0
              ? Effect.succeed(stdout)
              : Effect.fail(
                  new Error(
                    stderr.trim() ||
                      `Git command failed with exit code ${exitCode}`
                  )
                )
          )
        )
    );
    const refExists = Effect.fn("lazydiff/services/git/refExists")(
      (ref: string) =>
        runResult(["show-ref", "--verify", "--quiet", ref]).pipe(
          Effect.map(({ exitCode }) => exitCode === 0)
        )
    );
    const branchMutationSemaphore = yield* Semaphore.make(1);

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

    const listBranches = Effect.fn("lazydiff/services/git/listBranches")(() =>
      Effect.gen(function* () {
        const [currentHead, refsOutput, remotesOutput] = yield* Effect.all(
          [
            currentBranch(),
            runChecked([
              "for-each-ref",
              "--format=%(refname)%09%(committerdate:unix)%09%(symref)%09%(upstream:short)",
              "refs/heads",
              "refs/remotes",
            ]),
            runChecked(["remote"]),
          ],
          { concurrency: "unbounded" }
        );
        const remoteNames = remotesOutput
          .split("\n")
          .map((name) => name.trim())
          .filter((name) => name.length > 0);
        const localBranches: LocalBranchWithRecency[] = [];
        const remoteBranches: BranchWithRecency[] = [];

        for (const line of refsOutput.split("\n")) {
          if (line.length === 0) {
            continue;
          }

          const [fullName, lastCommitText, symbolicTarget, upstream] =
            line.split("\t");

          if (fullName === undefined || (symbolicTarget?.length ?? 0) > 0) {
            continue;
          }

          const parsedLastCommit = Math.trunc(Number(lastCommitText ?? "0"));
          const lastCommit = Number.isFinite(parsedLastCommit)
            ? parsedLastCommit
            : 0;

          if (fullName.startsWith("refs/heads/")) {
            const name = fullName.slice("refs/heads/".length);
            localBranches.push({
              current:
                currentHead._tag === "Branch" && currentHead.name === name,
              lastCommit,
              name,
              upstream: upstream?.length === 0 ? undefined : upstream,
            });
            continue;
          }

          if (fullName.startsWith("refs/remotes/")) {
            remoteBranches.push({
              branch: {
                current: false,
                isRemote: true,
                name: fullName.slice("refs/remotes/".length),
                remoteName: fullName.slice("refs/remotes/".length),
              },
              lastCommit,
            });
          }
        }

        const pairedRemoteNames = new Set<string>();
        const pairedLocalBranches: BranchWithRecency[] = localBranches.map(
          (localBranch) => {
            const remoteName = matchingRemoteName(
              localBranch,
              remoteBranches,
              remoteNames
            );

            if (remoteName !== undefined) {
              pairedRemoteNames.add(remoteName);
            }

            return {
              branch: {
                current: localBranch.current,
                isRemote: false,
                localName: localBranch.name,
                name: localBranch.name,
                ...(remoteName === undefined ? {} : { remoteName }),
              },
              lastCommit: localBranch.lastCommit,
            };
          }
        );
        const visibleRemoteBranches = remoteBranches.filter(
          ({ branch }) => !pairedRemoteNames.has(branch.name)
        );

        return [
          ...pairedLocalBranches.toSorted(byCurrentRecencyAndName),
          ...visibleRemoteBranches.toSorted(byCurrentRecencyAndName),
        ].map(({ branch }) => branch);
      })
    );

    const switchBranchUnlocked = Effect.fn(
      "lazydiff/services/git/switchBranchUnlocked"
    )((name: string) =>
      Effect.gen(function* () {
        if (name.trim().length === 0 || name !== name.trim()) {
          return yield* Effect.fail(new Error("Invalid Git branch name"));
        }

        const [localExists, remoteExists] = yield* Effect.all(
          [refExists(`refs/heads/${name}`), refExists(`refs/remotes/${name}`)],
          { concurrency: "unbounded" }
        );
        let checkoutArgs: readonly string[] = ["checkout", name];

        if (!localExists && remoteExists) {
          const [remotesOutput, trackingOutput] = yield* Effect.all(
            [
              runChecked(["remote"]),
              runChecked([
                "for-each-ref",
                "--format=%(refname:short)%09%(upstream:short)",
                "refs/heads",
              ]),
            ],
            { concurrency: "unbounded" }
          );
          const remoteNames = remotesOutput
            .split("\n")
            .map((remote) => remote.trim())
            .filter((remote) => remote.length > 0);
          const trackingBranch = trackingOutput
            .split("\n")
            .map((line) => line.split("\t"))
            .find(([, upstream]) => upstream === name)?.[0];
          const localCandidate = parseRemoteBranch(name, remoteNames)?.branch;
          const localCandidateExists =
            localCandidate === undefined
              ? false
              : yield* refExists(`refs/heads/${localCandidate}`);

          checkoutArgs = remoteCheckoutArgs(
            name,
            trackingBranch,
            localCandidateExists
          );
        }

        yield* runChecked(checkoutArgs);
        return yield* currentBranch();
      })
    );

    const switchBranch = Effect.fn("lazydiff/services/git/switchBranch")(
      (name: string) =>
        branchMutationSemaphore
          .withPermit(switchBranchUnlocked(name))
          .pipe(Effect.tap(publishBranchChange))
    );

    const createBranch = Effect.fn("lazydiff/services/git/createBranch")(
      (name: string) =>
        branchMutationSemaphore
          .withPermit(
            Effect.gen(function* () {
              if (name.trim().length === 0 || name !== name.trim()) {
                return yield* Effect.fail(new Error("Invalid Git branch name"));
              }

              yield* runChecked(["check-ref-format", "--branch", name]);
              const [localExists, remoteExists] = yield* Effect.all(
                [
                  refExists(`refs/heads/${name}`),
                  refExists(`refs/remotes/${name}`),
                ],
                { concurrency: "unbounded" }
              );

              if (localExists || remoteExists) {
                return yield* Effect.fail(
                  new Error(`Git branch already exists: ${name}`)
                );
              }

              yield* runChecked(["switch", "-c", name]);
              const head = yield* currentBranch();

              return head._tag === "Branch"
                ? head
                : yield* Effect.fail(
                    new Error(`Created branch was not checked out: ${name}`)
                  );
            })
          )
          .pipe(Effect.tap(publishBranchChange))
    );

    const deleteLocalBranch = Effect.fn(
      "lazydiff/services/git/deleteLocalBranch"
    )((name: string) =>
      Effect.gen(function* () {
        const head = yield* currentBranch();

        if (head._tag === "Branch" && head.name === name) {
          return yield* Effect.fail(
            new Error(`Cannot delete the currently checked out branch: ${name}`)
          );
        }

        if (!(yield* refExists(`refs/heads/${name}`))) {
          return yield* Effect.fail(
            new Error(`Local Git branch not found: ${name}`)
          );
        }

        yield* runChecked(["branch", "-d", "--", name]);
      })
    );

    const deleteRemoteBranch = Effect.fn(
      "lazydiff/services/git/deleteRemoteBranch"
    )((name: string) =>
      Effect.gen(function* () {
        if (!(yield* refExists(`refs/remotes/${name}`))) {
          return yield* Effect.fail(
            new Error(`Remote Git branch not found: ${name}`)
          );
        }

        const remoteNames = (yield* runChecked(["remote"]))
          .split("\n")
          .map((remote) => remote.trim())
          .filter((remote) => remote.length > 0);
        const parsed = parseRemoteBranch(name, remoteNames);

        if (parsed === undefined) {
          return yield* Effect.fail(
            new Error(`Unable to resolve the remote for Git branch: ${name}`)
          );
        }

        yield* runChecked(["push", parsed.remote, "--delete", parsed.branch]);
      })
    );

    const deleteBranch = Effect.fn("lazydiff/services/git/deleteBranch")(
      (options: {
        readonly localName?: string | undefined;
        readonly remoteName?: string | undefined;
        readonly target: GitBranchDeleteTarget;
      }) =>
        branchMutationSemaphore.withPermit(
          Effect.gen(function* () {
            if (options.target === "local") {
              return options.localName === undefined
                ? yield* Effect.fail(new Error("No local Git branch to delete"))
                : yield* deleteLocalBranch(options.localName);
            }

            if (options.target === "remote") {
              return options.remoteName === undefined
                ? yield* Effect.fail(
                    new Error("No remote Git branch to delete")
                  )
                : yield* deleteRemoteBranch(options.remoteName);
            }

            if (options.localName === undefined) {
              return yield* Effect.fail(
                new Error("No local Git branch to delete")
              );
            }

            if (options.remoteName === undefined) {
              return yield* Effect.fail(
                new Error("No remote Git branch to delete")
              );
            }

            yield* deleteLocalBranch(options.localName);
            yield* deleteRemoteBranch(options.remoteName).pipe(
              Effect.mapError(
                (error) =>
                  new Error(
                    `Local branch ${options.localName} was deleted, but remote deletion failed: ${error.message}`
                  )
              )
            );
          })
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
          (filePath): ParsedGitStatusEntry => ({
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
        ]).pipe(
          Effect.flatMap(parseGitStatus),
          Effect.map((entries) => sortStatusEntries(entries))
        )
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

    const parsedFileStatuses = Effect.fn(
      "lazydiff/services/git/parsedFileStatuses"
    )((scope: GitChangeScope, branch?: string) => {
      if (scope === "unstaged") {
        return unstagedStatuses();
      }

      if (scope === "staged") {
        return stagedStatuses();
      }

      return committedStatuses(branch);
    });

    const fileStatuses = Effect.fn("lazydiff/services/git/fileStatuses")(
      (scope: GitChangeScope, branch?: string) =>
        parsedFileStatuses(scope, branch).pipe(
          Effect.map(toProtocolStatusEntries)
        )
    );

    const changedFiles = Effect.fn("lazydiff/services/git/changedFiles")(
      (scope: GitChangeScope, branch?: string) =>
        fileStatuses(scope, branch).pipe(
          Effect.map((entries) => entries.map(({ path: filePath }) => filePath))
        )
    );

    const diffEntryBatch = Effect.fn("lazydiff/services/git/diffEntryBatch")((
      scope: GitChangeScope,
      entries: readonly ParsedGitStatusEntry[],
      branch?: string
    ) => {
      if (entries.length === 0) {
        return Effect.succeed("");
      }

      if (scope === "unstaged") {
        const trackedEntries = entries.filter(
          ({ status }) => status !== "untracked"
        );
        const untrackedPaths = entries
          .filter(({ status }) => status === "untracked")
          .map(({ path: filePath }) => filePath);
        const trackedPaths = pathspecsForEntries(trackedEntries);

        return Effect.gen(function* () {
          const trackedPatch =
            trackedPaths.length === 0
              ? ""
              : yield* run(["diff", "--find-renames", "--", ...trackedPaths]);
          // Untracked files have no index entry to diff against, so each one is
          // compared with an empty file instead.
          const untrackedPatches = yield* Effect.all(
            untrackedPaths.map((filePath) =>
              run(["diff", "--no-index", "--", nullDevice, filePath])
            ),
            { concurrency: untrackedDiffConcurrency }
          );

          return joinPatches([trackedPatch, ...untrackedPatches]);
        });
      }

      const paths = pathspecsForEntries(entries);

      if (scope === "staged") {
        return run(["diff", "--cached", "--find-renames", "--", ...paths]).pipe(
          Effect.map((patch) => joinPatches([patch]))
        );
      }

      return resolveComparisonBase(branch).pipe(
        Effect.flatMap((comparisonBase) =>
          run([
            "diff",
            "--find-renames",
            comparisonBase,
            "HEAD",
            "--",
            ...paths,
          ])
        ),
        Effect.map((patch) => joinPatches([patch]))
      );
    });

    /**
     * Streams unified patch batches (first {@link diffBatchSize} files, then
     * the rest) so clients can render progressively.
     */
    const scopeDiffBatches = (
      scope: GitChangeScope,
      branch?: string
    ): Stream.Stream<DiffBatch, Error> =>
      Stream.unwrap(
        parsedFileStatuses(scope, branch).pipe(
          Effect.map((entries) => {
            if (entries.length === 0) {
              return Stream.succeed<DiffBatch>({
                complete: true,
                patch: "",
                reset: true,
              });
            }

            const batches = chunkItems(entries, diffBatchSize);

            return Stream.fromIterable(
              batches.map((batch, index) => ({
                batch,
                complete: index === batches.length - 1,
                reset: index === 0,
              }))
            ).pipe(
              Stream.mapEffect(({ batch, complete, reset }) =>
                diffEntryBatch(scope, batch, branch).pipe(
                  Effect.map(
                    (patch): DiffBatch => ({
                      complete,
                      patch,
                      reset,
                    })
                  )
                )
              )
            );
          })
        )
      );

    /** Resolves the unified patch covering every changed file in the scope. */
    const scopeDiff = Effect.fn("lazydiff/services/git/scopeDiff")(
      (scope: GitChangeScope, branch?: string) =>
        scopeDiffBatches(scope, branch).pipe(
          Stream.runFold(
            () => "",
            (patch, batch) =>
              batch.reset ? batch.patch : joinPatches([patch, batch.patch])
          )
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

    const reviewSource = "working-tree" as GitReviewSource;

    /** Restarts batching whenever the working tree changes. */
    const diffBatches = (scope: GitChangeScope, branch?: string) =>
      Stream.merge(Stream.make("initial" as const), repositoryChanges).pipe(
        Stream.switchMap(() => scopeDiffBatches(scope, branch))
      );

    const statusChanges = (scope: GitChangeScope, branch?: string) =>
      Stream.merge(Stream.make("initial" as const), repositoryChanges).pipe(
        Stream.mapEffect(() => fileStatuses(scope, branch))
      );

    return {
      branchChanges: SubscriptionRef.changes(branchState),
      changedFiles,
      createBranch,
      currentBranch,
      deleteBranch,
      diffBatches,
      fileStatuses,
      listBranches,
      repositoryChanges,
      repositoryName,
      reviewSource,
      scopeDiff,
      statusChanges,
      switchBranch,
    };
  });

type GitShape = Effect.Success<ReturnType<typeof make>>;

export const Git = Context.Service<GitShape>("lazydiff/services/git");

export const makeGitLive = (options?: { readonly workingDirectory?: string }) =>
  Layer.effect(Git, make(options?.workingDirectory));

export const GitLive = makeGitLive();
