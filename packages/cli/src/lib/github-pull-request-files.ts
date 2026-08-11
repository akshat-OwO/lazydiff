import { Effect } from "effect";

import { VcsError } from "@/schemas/errors/vcs-error";

/**
 * GitHub's list-pull-request-files endpoint stops after this many files even
 * when pagination still looks exhausted.
 *
 * @see https://docs.github.com/en/rest/pulls/pulls#list-pull-requests-files
 */
export const githubPullRequestFilesApiLimit = 3000;

/**
 * Fails when the files endpoint returned fewer entries than the pull request
 * reports changed, which happens once GitHub's hard file cap is hit.
 */
export const assertPullRequestFilesComplete = (
  retrievedCount: number,
  reportedChangedFiles: number,
  pullRequestUrl: string
): Effect.Effect<void, VcsError> => {
  if (retrievedCount >= reportedChangedFiles) {
    return Effect.void;
  }

  return Effect.fail(
    new VcsError({
      message: `GitHub reports ${reportedChangedFiles} changed files on ${pullRequestUrl}, but only ${retrievedCount} could be retrieved. The pull-request files API stops after ${githubPullRequestFilesApiLimit} files, so this review is incomplete.`,
      reason: "Truncated",
    })
  );
};
