import type { GitStatusEntry } from "@lazydiff/protocol";
import { Context } from "effect";
import type { Effect, Stream } from "effect";

import type { VcsError } from "@/schemas/errors/vcs-error";

export { VcsError } from "@/schemas/errors/vcs-error";

export interface PullRequestRef {
  readonly host: "github.com";
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
  readonly number: number;
  readonly owner: string;
  readonly repo: string;
  readonly title: string;
  readonly url: string;
}

export interface VCSServiceShape {
  readonly openPullRequest: (
    url: string
  ) => Effect.Effect<PullRequestSession, VcsError>;
}

export class VCSService extends Context.Service<VCSService, VCSServiceShape>()(
  "lazydiff/services/vcs"
) {}
