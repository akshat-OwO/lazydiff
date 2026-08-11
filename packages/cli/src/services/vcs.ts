import type {
  GithubPrReviewComment,
  GithubPrReviewCommentInput,
  GithubPrReviewThread,
  GitStatusEntry,
} from "@lazydiff/protocol";
import { Context } from "effect";
import type { Effect, Stream } from "effect";

import type { VcsError } from "@/schemas/errors/vcs-error";

export { VcsError } from "@/schemas/errors/vcs-error";

export type PullRequestHost = "bitbucket.org" | "github.com";

export interface PullRequestRef {
  readonly host: PullRequestHost;
  readonly number: number;
  readonly owner: string;
  readonly repo: string;
}

/** One streamed slice of a pull request: its files and their unified patch. */
export interface PullRequestFileBatch {
  readonly entries: readonly GitStatusEntry[];
  readonly patch: string;
}

/**
 * A pull request opened for review. Metadata resolves in a single request so
 * the review server can start immediately, while files stream in afterwards.
 */
export interface PullRequestSession {
  readonly baseRefName: string;
  readonly fileBatches: Stream.Stream<PullRequestFileBatch, VcsError>;
  readonly headRefName: string;
  readonly headSha: string;
  readonly host: PullRequestHost;
  readonly number: number;
  readonly owner: string;
  readonly repo: string;
  readonly title: string;
  readonly url: string;
}

export interface PullRequestReviewSubmission {
  readonly htmlUrl: string;
}

export interface VCSServiceShape {
  readonly createPullRequestReview: (
    ref: PullRequestRef,
    commitId: string,
    comments: readonly GithubPrReviewCommentInput[]
  ) => Effect.Effect<PullRequestReviewSubmission, VcsError>;
  readonly listPullRequestReviewThreads: (
    ref: PullRequestRef
  ) => Effect.Effect<readonly GithubPrReviewThread[], VcsError>;
  readonly openPullRequest: (
    url: string
  ) => Effect.Effect<PullRequestSession, VcsError>;
  readonly replyToPullRequestReviewComment: (
    ref: PullRequestRef,
    commentId: number,
    body: string
  ) => Effect.Effect<GithubPrReviewComment, VcsError>;
  readonly setPullRequestReviewThreadResolved: (
    ref: PullRequestRef,
    threadId: string,
    resolved: boolean
  ) => Effect.Effect<{ readonly isResolved: boolean }, VcsError>;
}

export class VCSService extends Context.Service<VCSService, VCSServiceShape>()(
  "lazydiff/services/vcs"
) {}
