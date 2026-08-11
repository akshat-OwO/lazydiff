import type {
  GitBranch,
  GitBranchDeleteTarget,
  GitChangeScope,
  GitReviewSource,
  GitStatusEntry,
} from "@lazydiff/protocol";
import { Effect, Layer, Stream, SubscriptionRef } from "effect";

import { joinPatchFragments } from "@/lib/diff-batches";
import type { DiffBatch } from "@/lib/diff-batches";
import { Git } from "@/services/git";
import type { PullRequestSession, VcsError } from "@/services/vcs";

const branchHead = (name: string) =>
  ({
    _tag: "Branch" as const,
    name,
  }) as const;

const prMutationError = (action: string) =>
  new Error(`Cannot ${action} while reviewing a pull request`);

const forCommittedScope = <A>(scope: GitChangeScope, value: A, empty: A) =>
  Effect.succeed(scope === "committed" ? value : empty);

interface LoadState {
  readonly complete: boolean;
  readonly entries: GitStatusEntry[];
  readonly error: VcsError | undefined;
  readonly patches: string[];
}

const initialState: LoadState = {
  complete: false,
  entries: [],
  error: undefined,
  patches: [],
};

const make = (session: PullRequestSession) =>
  Effect.gen(function* () {
    const head = branchHead(session.headRefName);
    const branchState = yield* SubscriptionRef.make(head);
    const loadState = yield* SubscriptionRef.make(initialState);
    const branches: GitBranch[] = [
      {
        current: true,
        isRemote: false,
        localName: session.headRefName,
        name: session.headRefName,
      },
      {
        current: false,
        isRemote: false,
        localName: session.baseRefName,
        name: session.baseRefName,
      },
    ];

    // Files load in the background so the review server can serve immediately.
    yield* session.fileBatches.pipe(
      Stream.runForEach((batch) =>
        SubscriptionRef.update(loadState, (state) => ({
          ...state,
          entries: [...state.entries, ...batch.entries],
          patches: [...state.patches, batch.patch],
        }))
      ),
      Effect.matchEffect({
        onFailure: (error: VcsError) =>
          SubscriptionRef.update(loadState, (state) => ({
            ...state,
            complete: true,
            error,
          })),
        onSuccess: () =>
          SubscriptionRef.update(loadState, (state) => ({
            ...state,
            complete: true,
          })),
      }),
      Effect.forkScoped
    );

    const currentState = SubscriptionRef.get(loadState);

    const changedFiles = Effect.fn("lazydiff/services/prGit/changedFiles")(
      (scope: GitChangeScope, _branch?: string) =>
        currentState.pipe(
          Effect.flatMap((state) =>
            forCommittedScope(
              scope,
              state.entries.map(({ path }) => path),
              [] as string[]
            )
          )
        )
    );

    const createBranch = Effect.fn("lazydiff/services/prGit/createBranch")(
      (_name: string) => Effect.fail(prMutationError("create a branch"))
    );

    const currentBranch = Effect.fn("lazydiff/services/prGit/currentBranch")(
      () => Effect.succeed(head)
    );

    const deleteBranch = Effect.fn("lazydiff/services/prGit/deleteBranch")(
      (_options: {
        readonly localName?: string | undefined;
        readonly remoteName?: string | undefined;
        readonly target: GitBranchDeleteTarget;
      }) => Effect.fail(prMutationError("delete a branch"))
    );

    const fileStatuses = Effect.fn("lazydiff/services/prGit/fileStatuses")(
      (scope: GitChangeScope, _branch?: string) =>
        currentState.pipe(
          Effect.flatMap((state) =>
            forCommittedScope(scope, [...state.entries], [] as GitStatusEntry[])
          )
        )
    );

    const listBranches = Effect.fn("lazydiff/services/prGit/listBranches")(() =>
      Effect.succeed(branches)
    );

    const scopeDiff = Effect.fn("lazydiff/services/prGit/scopeDiff")(
      (scope: GitChangeScope, _branch?: string) =>
        currentState.pipe(
          Effect.flatMap((state) =>
            forCommittedScope(scope, joinPatchFragments(state.patches), "")
          )
        )
    );

    /** Emits loaded batches, then every batch that arrives afterwards. */
    const diffBatches = (
      scope: GitChangeScope,
      _branch?: string
    ): Stream.Stream<DiffBatch, VcsError> => {
      if (scope !== "committed") {
        return Stream.succeed({ complete: true, patch: "", reset: true });
      }

      return SubscriptionRef.changes(loadState).pipe(
        Stream.mapAccum(
          () => 0,
          (emitted, state) => {
            const pending = state.patches.slice(emitted);

            if (pending.length === 0 && !state.complete) {
              return [emitted, []];
            }

            return [
              state.patches.length,
              [
                {
                  complete: state.complete,
                  patch: joinPatchFragments(pending),
                  reset: emitted === 0,
                },
              ],
            ];
          }
        ),
        Stream.takeUntil((batch) => batch.complete),
        Stream.concat(
          Stream.unwrap(
            currentState.pipe(
              Effect.map((state) =>
                state.error === undefined
                  ? Stream.empty
                  : Stream.fail(state.error)
              )
            )
          )
        )
      );
    };

    const statusChanges = (
      scope: GitChangeScope,
      _branch?: string
    ): Stream.Stream<GitStatusEntry[], VcsError> => {
      if (scope !== "committed") {
        return Stream.succeed([] as GitStatusEntry[]);
      }

      return SubscriptionRef.changes(loadState).pipe(
        Stream.takeUntil((state) => state.complete),
        Stream.map((state) => [...state.entries])
      );
    };

    const switchBranch = Effect.fn("lazydiff/services/prGit/switchBranch")(
      (_name: string) => Effect.fail(prMutationError("switch branches"))
    );

    const reviewSource = "pull-request" as GitReviewSource;

    return {
      branchChanges: SubscriptionRef.changes(branchState),
      changedFiles,
      createBranch,
      currentBranch,
      deleteBranch,
      diffBatches,
      fileStatuses,
      listBranches,
      repositoryChanges: Stream.never,
      repositoryName: `${session.owner}/${session.repo}#${session.number}`,
      reviewSource,
      scopeDiff,
      statusChanges,
      switchBranch,
    };
  });

export const makePrGitLive = (session: PullRequestSession) =>
  Layer.effect(Git, make(session));
