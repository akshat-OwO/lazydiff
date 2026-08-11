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

  const fileDiffs: FileDiffMetadata[] = [];

  for (const { files } of parsePatchFiles(patch)) {
    for (const fileDiff of files) {
      // The parser keeps the pathname exactly as the patch header
      // spells it, which the tree and the hash cannot match.
      fileDiff.name = unquoteGitPath(fileDiff.name);

      if (fileDiff.prevName !== undefined) {
        fileDiff.prevName = unquoteGitPath(fileDiff.prevName);
      }

      fileDiffs.push(fileDiff);
    }
  }

  return fileDiffs.toSorted((left, right) =>
    left.name.localeCompare(right.name)
  );
}
