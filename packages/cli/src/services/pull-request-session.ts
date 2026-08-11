import type { Option } from "effect";
import { Context, Layer } from "effect";

import type { PullRequestHost } from "@/services/vcs";

/**
 * Metadata for the pull request currently under review. Kept separate from
 * {@link import("@/services/vcs").PullRequestSession} so RPC handlers do not
 * hold onto the streamed file-batch handle.
 */
export interface OpenedPullRequest {
  readonly headSha: string;
  readonly host: PullRequestHost;
  readonly number: number;
  readonly owner: string;
  readonly repo: string;
  readonly title: string;
  readonly url: string;
}

export interface PullRequestContextShape {
  readonly pullRequest: Option.Option<OpenedPullRequest>;
}

export class PullRequestContext extends Context.Service<
  PullRequestContext,
  PullRequestContextShape
>()("lazydiff/services/pullRequestSession") {}

export const makePullRequestContextLive = (
  pullRequest: Option.Option<OpenedPullRequest>
) => Layer.succeed(PullRequestContext, { pullRequest });

export const openedPullRequestFromSession = (session: {
  readonly headSha: string;
  readonly host: PullRequestHost;
  readonly number: number;
  readonly owner: string;
  readonly repo: string;
  readonly title: string;
  readonly url: string;
}): OpenedPullRequest => ({
  headSha: session.headSha,
  host: session.host,
  number: session.number,
  owner: session.owner,
  repo: session.repo,
  title: session.title,
  url: session.url,
});
