import type { AnnotationSide, SelectedLineRange } from "@pierre/diffs";
import { Atom } from "effect/unstable/reactivity";

export interface DiffAnnotation {
  readonly codeDiff: string;
  readonly comment: string;
  readonly filePath: string;
  readonly id: string;
  readonly range: SelectedLineRange;
}

export interface AnnotationDraft {
  readonly codeDiff: string;
  readonly filePath: string;
  readonly lineNumber: number;
  readonly range: SelectedLineRange;
  readonly side: AnnotationSide;
}

export const annotationsAtom = Atom.make<readonly DiffAnnotation[]>([]);

export const annotationDraftAtom = Atom.make<AnnotationDraft | null>(null);

export const annotationsSidebarOpenAtom = Atom.make(false);

export function createAnnotationId(): string {
  return crypto.randomUUID();
}

const quoteDiffLines = (codeDiff: string) =>
  codeDiff
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

/**
 * Formats saved annotations as markdown a user can paste into an agent chat.
 */
export function formatAnnotationsMarkdown(
  annotations: readonly DiffAnnotation[]
): string {
  return annotations
    .map((annotation, index) => {
      const title = `### Annotation ${index + 1}`;
      const pathLine = `> ${annotation.filePath}`;
      const quotedDiff =
        annotation.codeDiff.length === 0
          ? ""
          : `\n${quoteDiffLines(annotation.codeDiff)}`;

      return `${title}\n${pathLine}${quotedDiff}\n\n${annotation.comment}`;
    })
    .join("\n\n");
}
