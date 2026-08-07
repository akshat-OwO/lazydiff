import type { FileDiffMetadata } from "@pierre/diffs";

export interface ChangedLineCounts {
  readonly additions: number;
  readonly deletions: number;
}

export function countChangedLines(
  fileDiff: FileDiffMetadata
): ChangedLineCounts {
  let additions = 0;
  let deletions = 0;

  for (const hunk of fileDiff.hunks) {
    additions += hunk.additionLines;
    deletions += hunk.deletionLines;
  }

  return { additions, deletions };
}

export function sumChangedLines(
  fileDiffs: readonly FileDiffMetadata[]
): ChangedLineCounts {
  let additions = 0;
  let deletions = 0;

  for (const fileDiff of fileDiffs) {
    const counts = countChangedLines(fileDiff);
    additions += counts.additions;
    deletions += counts.deletions;
  }

  return { additions, deletions };
}

export function describeModeChange(fileDiff: FileDiffMetadata) {
  const { mode, prevMode } = fileDiff;

  return prevMode === undefined || mode === undefined || prevMode === mode
    ? null
    : `mode ${prevMode} → ${mode}`;
}

/**
 * Renames, mode changes, binary content, and empty files are all valid changes
 * that carry no hunks. Without an explicit description they render as a blank
 * diff, which a reviewer cannot tell apart from an unchanged file.
 */
export function describeChangeWithoutHunks(fileDiff: FileDiffMetadata) {
  if (fileDiff.hunks.length > 0) {
    return null;
  }

  if (fileDiff.type === "rename-pure") {
    return "Renamed without content changes.";
  }

  const modeChange = describeModeChange(fileDiff);

  if (modeChange !== null) {
    return `File mode changed from ${fileDiff.prevMode} to ${fileDiff.mode}.`;
  }

  return "No textual changes to show. This is usually a binary or empty file.";
}
