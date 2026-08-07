import type {
  AnnotationSide,
  FileDiffMetadata,
  SelectedLineRange,
  SelectionSide,
} from "@pierre/diffs";

interface UnifiedDiffLine {
  readonly additionLineNumber: number | null;
  readonly deletionLineNumber: number | null;
  readonly text: string;
  readonly type: "addition" | "context" | "deletion";
}

const stripTrailingNewline = (text: string) =>
  text.endsWith("\n") ? text.slice(0, -1) : text;

const linePrefixes = {
  addition: "+",
  context: " ",
  deletion: "-",
} as const satisfies Record<UnifiedDiffLine["type"], string>;

const prefixForLine = (type: UnifiedDiffLine["type"]) => linePrefixes[type];

/**
 * Walks patch hunks in unified order so selected line numbers (1-based on a
 * file side) can be mapped back to the rendered +/-/context rows.
 */
export function iterateUnifiedDiffLines(
  fileDiff: FileDiffMetadata
): readonly UnifiedDiffLine[] {
  const lines: UnifiedDiffLine[] = [];

  for (const hunk of fileDiff.hunks) {
    let additionLine = hunk.additionStart;
    let deletionLine = hunk.deletionStart;

    for (const content of hunk.hunkContent) {
      if (content.type === "context") {
        for (let index = 0; index < content.lines; index += 1) {
          const text =
            fileDiff.additionLines[content.additionLineIndex + index];

          if (text === undefined) {
            continue;
          }

          lines.push({
            additionLineNumber: additionLine,
            deletionLineNumber: deletionLine,
            text: stripTrailingNewline(text),
            type: "context",
          });
          additionLine += 1;
          deletionLine += 1;
        }
        continue;
      }

      for (let index = 0; index < content.deletions; index += 1) {
        const text = fileDiff.deletionLines[content.deletionLineIndex + index];

        if (text === undefined) {
          continue;
        }

        lines.push({
          additionLineNumber: null,
          deletionLineNumber: deletionLine,
          text: stripTrailingNewline(text),
          type: "deletion",
        });
        deletionLine += 1;
      }

      for (let index = 0; index < content.additions; index += 1) {
        const text = fileDiff.additionLines[content.additionLineIndex + index];

        if (text === undefined) {
          continue;
        }

        lines.push({
          additionLineNumber: additionLine,
          deletionLineNumber: null,
          text: stripTrailingNewline(text),
          type: "addition",
        });
        additionLine += 1;
      }
    }
  }

  return lines;
}

const lineMatchesSide = (
  line: UnifiedDiffLine,
  lineNumber: number,
  effectiveSide: SelectionSide | AnnotationSide | undefined = "additions"
) =>
  effectiveSide === "additions"
    ? line.additionLineNumber === lineNumber
    : line.deletionLineNumber === lineNumber;

const findLineIndex = (
  lines: readonly UnifiedDiffLine[],
  lineNumber: number,
  side: SelectionSide | AnnotationSide | undefined,
  fromIndex: number
) => {
  for (let index = fromIndex; index < lines.length; index += 1) {
    const line = lines[index];

    if (line !== undefined && lineMatchesSide(line, lineNumber, side)) {
      return index;
    }
  }

  return -1;
};

/**
 * Builds a unified-style snippet for the selected line range, suitable for
 * quoting inside an annotation or pasting into an agent prompt.
 */
export function extractDiffSnippet(
  fileDiff: FileDiffMetadata,
  range: SelectedLineRange
): string {
  const lines = iterateUnifiedDiffLines(fileDiff);
  const startIndex = findLineIndex(lines, range.start, range.side, 0);

  if (startIndex < 0) {
    return "";
  }

  const endSide = range.endSide ?? range.side;
  let endIndex = findLineIndex(lines, range.end, endSide, startIndex);

  if (endIndex < 0) {
    endIndex = startIndex;
  }

  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);

  return lines
    .slice(from, to + 1)
    .map((line) => `${prefixForLine(line.type)}${line.text}`)
    .join("\n");
}

export function annotationAnchorForRange(range: SelectedLineRange): {
  readonly lineNumber: number;
  readonly side: AnnotationSide;
} {
  return {
    lineNumber: range.end,
    side: range.endSide ?? range.side ?? "additions",
  };
}
