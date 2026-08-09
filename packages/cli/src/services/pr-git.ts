import type {
  GitBranch,
  GitBranchDeleteTarget,
  GitChangeScope,
  GitStatusEntry,
} from "@lazydiff/protocol";
import { Effect, Layer, Stream, SubscriptionRef } from "effect";

import { Git } from "@/services/git";
import type { PullRequestReview } from "@/services/vcs";

const branchHead = (name: string) =>
  ({
    _tag: "Branch" as const,
    name,
  }) as const;

const prMutationError = (action: string) =>
  new Error(`Cannot ${action} while reviewing a pull request`);

const forCommittedScope = <A>(scope: GitChangeScope, value: A, empty: A) =>
  Effect.succeed(scope === "committed" ? value : empty);

const make = (pullRequest: PullRequestReview) =>
  Effect.gen(function* () {
    const head = branchHead(pullRequest.headRefName);
    const branchState = yield* SubscriptionRef.make(head);
    const committedEntries: GitStatusEntry[] = [...pullRequest.entries];
    const committedFiles: string[] = committedEntries.map(({ path }) => path);
    const branches: GitBranch[] = [
      {
        current: true,
        isRemote: false,
        localName: pullRequest.headRefName,
        name: pullRequest.headRefName,
      },
      {
        current: false,
        isRemote: false,
        localName: pullRequest.baseRefName,
        name: pullRequest.baseRefName,
      },
    ];

    const changedFiles = Effect.fn("lazydiff/services/prGit/changedFiles")(
      (scope: GitChangeScope, _branch?: string) =>
        forCommittedScope(scope, committedFiles, [] as string[])
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
        forCommittedScope(scope, committedEntries, [] as GitStatusEntry[])
    );

    const listBranches = Effect.fn("lazydiff/services/prGit/listBranches")(() =>
      Effect.succeed(branches)
    );

    const scopeDiff = Effect.fn("lazydiff/services/prGit/scopeDiff")(
      (scope: GitChangeScope, _branch?: string) =>
        forCommittedScope(scope, pullRequest.patch, "")
    );

    const switchBranch = Effect.fn("lazydiff/services/prGit/switchBranch")(
      (_name: string) => Effect.fail(prMutationError("switch branches"))
    );

    return {
      branchChanges: SubscriptionRef.changes(branchState),
      changedFiles,
      createBranch,
      currentBranch,
      deleteBranch,
      fileStatuses,
      listBranches,
      repositoryChanges: Stream.never,
      repositoryName: `${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`,
      scopeDiff,
      switchBranch,
    };
  });

export const makePrGitLive = (pullRequest: PullRequestReview) =>
  Layer.effect(Git, make(pullRequest));
