import type {
  GithubPrReviewComment,
  GithubPrReviewCommentInput,
  GithubPrReviewThread,
  GitStatusEntry,
} from "@lazydiff/protocol";
import { Context } from "effect";
import type { Effect } from "effect";

import type { VcsError } from "@/services/vcs-error";

export { VcsError } from "@/services/vcs-error";

export type PullRequestHost = "bitbucket.org" | "github.com";

export interface PullRequestRef {
  readonly host: PullRequestHost;
  readonly number: number;
  readonly owner: string;
  readonly repo: string;
}

export interface PullRequestReview {
  readonly baseRefName: string;
  readonly entries: readonly GitStatusEntry[];
  readonly headRefName: string;
  readonly headSha: string;
  readonly host: PullRequestHost;
  readonly number: number;
  readonly owner: string;
  readonly patch: string;
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
  readonly fetchPullRequest: (
    url: string
  ) => Effect.Effect<PullRequestReview, VcsError>;
  readonly listPullRequestReviewThreads: (
    ref: PullRequestRef
  ) => Effect.Effect<readonly GithubPrReviewThread[], VcsError>;
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
