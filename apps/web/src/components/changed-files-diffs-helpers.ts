import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";

import { fileDiffAnchorId } from "@/lib/file-diff-anchor";
import type { FileDiffSectionContentOffset } from "@/lib/file-diff-in-view";
import { unquoteGitPath } from "@/lib/git-path";

const withoutPath = (paths: ReadonlySet<string>, path: string) => {
  const next = new Set(paths);
  next.delete(path);
  return next;
};

const parseFileDiffsFromPatch = (
  patch: string
): readonly FileDiffMetadata[] => {
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
};

const measureSectionContentTops = (
  scrollport: HTMLElement,
  fileDiffs: readonly FileDiffMetadata[]
): readonly FileDiffSectionContentOffset[] => {
  const scrollportTop = scrollport.getBoundingClientRect().top;
  const { scrollTop } = scrollport;
  const elementsById = new Map<string, HTMLElement>();

  for (const child of scrollport.children) {
    if (child instanceof HTMLElement && child.id.length > 0) {
      elementsById.set(child.id, child);
    }
  }

  const sections: FileDiffSectionContentOffset[] = [];

  for (const fileDiff of fileDiffs) {
    const element = elementsById.get(fileDiffAnchorId(fileDiff.name));

    if (element === undefined) {
      continue;
    }

    sections.push({
      contentTop:
        element.getBoundingClientRect().top - scrollportTop + scrollTop,
      path: fileDiff.name,
    });
  }

  return sections;
};

export { measureSectionContentTops, parseFileDiffsFromPatch, withoutPath };
