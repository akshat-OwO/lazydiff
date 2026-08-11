import type { GitStatusEntry } from "@lazydiff/protocol";

import {
  chunkItems,
  diffBatchSize,
  joinPatchFragments,
  splitUnifiedPatch,
} from "@/lib/diff-batches";
import type { PullRequestFileBatch } from "@/services/vcs";

const gitDiffHeaderPattern =
  /^diff --git (?:a\/|"a\/)(?<oldPath>.+?)(?:"|) (?:b\/|"b\/)(?<newPath>.+?)(?:"|)\s*$/mu;

/**
 * Reads old/new paths from a unified `diff --git` header line.
 */
export const pathsFromDiffGitHeader = (
  fragment: string
):
  | {
      readonly newPath: string;
      readonly oldPath: string;
    }
  | undefined => {
  const match = gitDiffHeaderPattern.exec(fragment);
  const oldPath = match?.groups?.oldPath;
  const newPath = match?.groups?.newPath;

  if (oldPath === undefined || newPath === undefined) {
    return undefined;
  }

  return { newPath, oldPath };
};

/**
 * Builds streamed pull-request file batches from Bitbucket diffstat entries and
 * a single unified patch response.
 */
export const buildBitbucketPullRequestFileBatches = (
  entries: readonly GitStatusEntry[],
  patch: string,
  batchSize = diffBatchSize
): readonly PullRequestFileBatch[] => {
  const fragments = splitUnifiedPatch(patch);
  const fragmentByPath = new Map<string, string>();

  for (const fragment of fragments) {
    const paths = pathsFromDiffGitHeader(fragment);

    if (paths === undefined) {
      continue;
    }

    fragmentByPath.set(paths.newPath, fragment);

    if (paths.oldPath !== paths.newPath) {
      fragmentByPath.set(paths.oldPath, fragment);
    }
  }

  if (entries.length === 0) {
    if (fragments.length === 0) {
      return [{ entries: [], patch: "" }];
    }

    return chunkItems(fragments, batchSize).map((chunk) => ({
      entries: [],
      patch: joinPatchFragments(chunk),
    }));
  }

  return chunkItems(entries, batchSize).map((chunk) => ({
    entries: chunk,
    patch: joinPatchFragments(
      chunk.flatMap((entry) => {
        const fragment = fragmentByPath.get(entry.path);

        return fragment === undefined ? [] : [fragment];
      })
    ),
  }));
};
