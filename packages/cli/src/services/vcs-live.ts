import { Effect, Layer, Option } from "effect";

import { parseBitbucketPullRequestUrl } from "@/services/bitbucket-pull-request-url";
import { parseGithubPullRequestUrl } from "@/services/github-pull-request-url";
import type { VCSServiceShape, PullRequestRef } from "@/services/vcs";
import { VCSService, VcsError } from "@/services/vcs";
import { makeBitbucketVcs } from "@/services/vcs-bitbucket";
import { makeGithubVcs } from "@/services/vcs-github";

const unsupportedPullRequestUrl = (url: string) =>
  new VcsError({
    message: `Unsupported pull request URL: ${url}. Expected a GitHub URL like https://github.com/owner/repo/pull/123 or a Bitbucket URL like https://bitbucket.org/workspace/repo/pull-requests/123.`,
    reason: "InvalidPullRequestUrl",
  });

const providerForRef = (
  ref: PullRequestRef,
  github: VCSServiceShape,
  bitbucket: VCSServiceShape
): VCSServiceShape => {
  if (ref.host === "bitbucket.org") {
    return bitbucket;
  }

  return github;
};

export const makeVcs = Effect.gen(function* () {
  const github = yield* makeGithubVcs;
  const bitbucket = yield* makeBitbucketVcs;

  return {
    createPullRequestReview: (ref, commitId, comments) =>
      providerForRef(ref, github, bitbucket).createPullRequestReview(
        ref,
        commitId,
        comments
      ),
    fetchPullRequest: (url) => {
      if (Option.isSome(parseBitbucketPullRequestUrl(url))) {
        return bitbucket.fetchPullRequest(url);
      }

      if (Option.isSome(parseGithubPullRequestUrl(url))) {
        return github.fetchPullRequest(url);
      }

      return Effect.fail(unsupportedPullRequestUrl(url));
    },
    listPullRequestReviewThreads: (ref) =>
      providerForRef(ref, github, bitbucket).listPullRequestReviewThreads(ref),
    replyToPullRequestReviewComment: (ref, commentId, body) =>
      providerForRef(ref, github, bitbucket).replyToPullRequestReviewComment(
        ref,
        commentId,
        body
      ),
    setPullRequestReviewThreadResolved: (ref, threadId, resolved) =>
      providerForRef(ref, github, bitbucket).setPullRequestReviewThreadResolved(
        ref,
        threadId,
        resolved
      ),
  } satisfies VCSServiceShape;
});

export const VcsLive = Layer.effect(VCSService, makeVcs);
