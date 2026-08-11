import type { GitFileStatus } from "@lazydiff/protocol";
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
 * Bitbucket caps a single file's raw diff body at this many changed lines.
 *
 * @see https://support.atlassian.com/bitbucket-cloud/docs/limits-for-viewing-content-and-diffs/
 */
export const bitbucketPullRequestDiffFileChangedLinesApiLimit = 2000;

/** One reviewable file from Bitbucket diffstat, including reported line counts. */
export interface BitbucketDiffstatFile {
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly path: string;
  readonly status: GitFileStatus;
}

/**
 * Counts added and removed lines inside unified-diff hunks.
 *
 * File headers (`---` / `+++`) are ignored by only counting after a hunk
 * header (`@@`). That keeps source lines that themselves begin with `++` or
 * `--` (encoded as `+++…` / `---…` inside a hunk) from being discarded.
 */
export const countUnifiedPatchChangedLines = (fragment: string): number => {
  let count = 0;
  let inHunk = false;

  for (const line of fragment.split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }

    if (!inHunk) {
      continue;
    }

    if (line.startsWith("+") || line.startsWith("-")) {
      count += 1;
    }
  }

  return count;
};

/**
 * Detects a binary-file fragment that has no reviewable text hunks.
 */
export const isBinaryPatchFragment = (fragment: string): boolean =>
  /^Binary files /mu.test(fragment) || /^GIT binary patch$/mu.test(fragment);

/**
 * Fails when the aggregate `/diff` response omits a diffstat file or returns a
 * truncated text body for one. Binary fragments are accepted without line-count
 * reconciliation; text fragments must include every changed line reported by
 * diffstat.
 */
export const assertBitbucketPullRequestDiffComplete = (
  files: readonly BitbucketDiffstatFile[],
  patch: string,
  pullRequestUrl: string
): Effect.Effect<void, VcsError> => {
  if (files.length === 0) {
    return Effect.void;
  }

  const fragmentByPath = new Map<string, string>();

  for (const fragment of splitUnifiedPatch(patch)) {
    const paths = pathsFromDiffGitHeader(fragment);

    if (paths === undefined) {
      continue;
    }

    fragmentByPath.set(paths.newPath, fragment);
    fragmentByPath.set(paths.oldPath, fragment);
  }

  const missing = files.filter((file) => !fragmentByPath.has(file.path));

  if (missing.length > 0) {
    const examplePath = missing[0]?.path ?? "unknown";

    return Effect.fail(
      new VcsError({
        message: `Bitbucket returned an incomplete pull request diff for ${pullRequestUrl}: ${files.length} changed files were listed, but ${missing.length} file(s) were missing from the aggregate diff (including ${examplePath}). Bitbucket caps aggregate diffs at ${bitbucketPullRequestDiffFilesApiLimit} files and 8000 changed lines, so this review is incomplete.`,
        reason: "Truncated",
      })
    );
  }

  for (const file of files) {
    const fragment = fragmentByPath.get(file.path);

    if (fragment === undefined) {
      continue;
    }

    if (isBinaryPatchFragment(fragment)) {
      continue;
    }

    const reportedChangedLines = file.linesAdded + file.linesRemoved;
    const fragmentChangedLines = countUnifiedPatchChangedLines(fragment);

    if (fragmentChangedLines < reportedChangedLines) {
      return Effect.fail(
        new VcsError({
          message: `Bitbucket returned a truncated diff for ${file.path} on ${pullRequestUrl}: diffstat reports ${reportedChangedLines} changed lines, but the aggregate diff only includes ${fragmentChangedLines}. Bitbucket caps a single file at ${bitbucketPullRequestDiffFileChangedLinesApiLimit} changed lines or 100 KB, so this review is incomplete.`,
          reason: "Truncated",
        })
      );
    }
  }

  return Effect.void;
};
