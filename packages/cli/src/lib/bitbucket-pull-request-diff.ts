import type { GitStatusEntry } from "@lazydiff/protocol";
import { Effect } from "effect";

import { pathsFromDiffGitHeader } from "@/lib/bitbucket-pull-request-batches";
import { splitUnifiedPatch } from "@/lib/diff-batches";
import { VcsError } from "@/schemas/errors/vcs-error";

/**
 * Bitbucket caps an aggregate pull-request diff at this many files.
 *
 * @see https://support.atlassian.com/bitbucket-cloud/docs/limits-for-viewing-content-and-diffs/
 */
export const bitbucketPullRequestDiffFilesApiLimit = 200;

/**
 * Fails when the aggregate `/diff` response is missing reviewable fragments for
 * files listed by diffstat. Text and binary files still produce `diff --git`
 * headers when present; omitted headers mean the capped aggregate response is
 * incomplete.
 */
export const assertBitbucketPullRequestDiffComplete = (
  entries: readonly GitStatusEntry[],
  patch: string,
  pullRequestUrl: string
): Effect.Effect<void, VcsError> => {
  if (entries.length === 0) {
    return Effect.void;
  }

  const fragmentPaths = new Set<string>();

  for (const fragment of splitUnifiedPatch(patch)) {
    const paths = pathsFromDiffGitHeader(fragment);

    if (paths === undefined) {
      continue;
    }

    fragmentPaths.add(paths.newPath);
    fragmentPaths.add(paths.oldPath);
  }

  const missing = entries.filter((entry) => !fragmentPaths.has(entry.path));

  if (missing.length === 0) {
    return Effect.void;
  }

  const examplePath = missing[0]?.path ?? "unknown";

  return Effect.fail(
    new VcsError({
      message: `Bitbucket returned an incomplete pull request diff for ${pullRequestUrl}: ${entries.length} changed files were listed, but ${missing.length} file(s) were missing from the aggregate diff (including ${examplePath}). Bitbucket caps aggregate diffs at ${bitbucketPullRequestDiffFilesApiLimit} files and 8000 changed lines, so this review is incomplete.`,
      reason: "Truncated",
    })
  );
};
