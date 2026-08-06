import type { GitHead } from "@lazydiff/protocol";
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

    const run = Effect.fn("lazydiff/services/git/run")(
      (args: readonly string[]) =>
        childProcessSpawner.string(
          ChildProcess.make(
            "git",
            args,
            workingDirectory === undefined
              ? undefined
              : { cwd: workingDirectory }
          )
        )
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

    const gitDirectory = yield* run(["rev-parse", "--absolute-git-dir"]).pipe(
      Effect.map((output) => output.trim())
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
      currentBranch,
    };
  });

type GitShape = Effect.Success<ReturnType<typeof make>>;

export const Git = Context.Service<GitShape>("lazydiff/services/git");

export const makeGitLive = (options?: { readonly workingDirectory?: string }) =>
  Layer.effect(Git, make(options?.workingDirectory));

export const GitLive = makeGitLive();
