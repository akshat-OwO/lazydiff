import { Option } from "effect";

import type { PullRequestRef } from "@/services/vcs";

const bitbucketPullRequestUrlPattern =
  /^https?:\/\/(?:www\.)?bitbucket\.org\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull-requests\/(?<number>\d+)\b/iu;

/**
 * Parses a Bitbucket Cloud pull request URL into workspace, repository, and
 * number.
 */
export const parseBitbucketPullRequestUrl = (
  value: string
): Option.Option<PullRequestRef> => {
  const trimmed = value.trim();
  const match = bitbucketPullRequestUrlPattern.exec(trimmed);

  if (match?.groups === undefined) {
    return Option.none();
  }

  const { number, owner, repo } = match.groups;

  if (owner === undefined || repo === undefined || number === undefined) {
    return Option.none();
  }

  const pullNumber = Math.trunc(Number(number));

  if (!Number.isSafeInteger(pullNumber) || pullNumber <= 0) {
    return Option.none();
  }

  return Option.some({
    host: "bitbucket.org",
    number: pullNumber,
    owner,
    repo,
  });
};

export const formatBitbucketPullRequestUrl = (ref: PullRequestRef): string =>
  `https://bitbucket.org/${ref.owner}/${ref.repo}/pull-requests/${ref.number}`;
