import type { Option } from "effect";
import { Context, Layer } from "effect";

import type { PullRequestReview } from "@/services/vcs";

export interface PullRequestSessionShape {
  readonly review: Option.Option<PullRequestReview>;
}

export class PullRequestSession extends Context.Service<
  PullRequestSession,
  PullRequestSessionShape
>()("lazydiff/services/pullRequestSession") {}

export const makePullRequestSessionLive = (
  review: Option.Option<PullRequestReview>
) => Layer.succeed(PullRequestSession, { review });
