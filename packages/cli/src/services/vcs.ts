import type { GitStatusEntry } from "@lazydiff/protocol";
import { Context } from "effect";
import type { Effect } from "effect";

import type { VcsError } from "@/services/vcs-error";

export { VcsError } from "@/services/vcs-error";

export interface PullRequestRef {
  readonly host: "github.com";
  readonly number: number;
  readonly owner: string;
  readonly repo: string;
}

export interface PullRequestReview {
  readonly baseRefName: string;
  readonly entries: readonly GitStatusEntry[];
  readonly headRefName: string;
  readonly number: number;
  readonly owner: string;
  readonly patch: string;
  readonly repo: string;
  readonly title: string;
  readonly url: string;
}

export interface VCSServiceShape {
  readonly fetchPullRequest: (
    url: string
  ) => Effect.Effect<PullRequestReview, VcsError>;
}

export class VCSService extends Context.Service<VCSService, VCSServiceShape>()(
  "lazydiff/services/vcs"
) {}
