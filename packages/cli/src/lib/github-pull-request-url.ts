import { Option } from "effect";

import type { PullRequestRef } from "@/services/vcs";

const githubPullRequestUrlPattern =
  /^https?:\/\/(?:www\.)?github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull\/(?<number>\d+)\b/iu;

/**
 * Parses a GitHub pull request URL into owner, repository, and number.
 */
export const parseGithubPullRequestUrl = (
  value: string
): Option.Option<PullRequestRef> => {
  const trimmed = value.trim();
  const match = githubPullRequestUrlPattern.exec(trimmed);

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
    host: "github.com",
    number: pullNumber,
    owner,
    repo,
  });
};

export const formatGithubPullRequestUrl = (ref: PullRequestRef): string =>
  `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`;
