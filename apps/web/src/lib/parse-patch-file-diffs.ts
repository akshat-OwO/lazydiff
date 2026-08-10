import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";

import { unquoteGitPath } from "@/lib/git-path";

/**
 * Parses a unified patch fragment into sorted file diffs with git-unquoted paths.
 */
export function parsePatchFileDiffs(patch: string): FileDiffMetadata[] {
  if (patch.length === 0) {
    return [];
  }

  return parsePatchFiles(patch)
    .flatMap(({ files }) => files)
    .map((fileDiff) => {
      fileDiff.name = unquoteGitPath(fileDiff.name);

      if (fileDiff.prevName !== undefined) {
        fileDiff.prevName = unquoteGitPath(fileDiff.prevName);
      }

      return fileDiff;
    })
    .toSorted((left, right) => left.name.localeCompare(right.name));
}
