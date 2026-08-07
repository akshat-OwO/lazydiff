import type { GitChangeScope } from "@lazydiff/protocol";
import type {
  AnnotationSide,
  FileDiffMetadata,
  SelectedLineRange,
} from "@pierre/diffs";
import { Atom } from "effect/unstable/reactivity";

import { extractDiffSnippet } from "./annotation-snippet.ts";

export interface DiffAnnotation {
  readonly codeDiff: string;
  readonly comment: string;
  readonly filePath: string;
  readonly id: string;
  readonly range: SelectedLineRange;
  readonly scope: GitChangeScope;
}

export interface AnnotationDraft {
  readonly codeDiff: string;
  readonly filePath: string;
  readonly lineNumber: number;
  readonly range: SelectedLineRange;
  readonly scope: GitChangeScope;
  readonly side: AnnotationSide;
}

export const annotationsAtom = Atom.make<readonly DiffAnnotation[]>([]);

export const annotationDraftAtom = Atom.make<AnnotationDraft | null>(null);

export const annotationsSidebarOpenAtom = Atom.make(false);

export const annotationFocusAtom = Atom.make<{
  readonly annotationId: string;
  readonly filePath: string;
} | null>(null);

export function createAnnotationId(): string {
  return crypto.randomUUID();
}

/**
 * Prefer an existing multi-line selection when the user clicks +, so the draft
 * covers the whole highlighted range instead of only the clicked line.
 */
export function resolveAnnotationRange(
  clickRange: SelectedLineRange,
  selectedLines: SelectedLineRange | null
): SelectedLineRange {
  return selectedLines ?? clickRange;
}

/**
 * Pierre commits the current selection after `onGutterUtilityClick`. Drop that
 * restore so a controlled selection cleared for the draft stays cleared.
 */
export function applyLineSelectedUpdate(
  range: SelectedLineRange | null,
  dropNext: boolean
): {
  readonly dropNext: boolean;
  readonly selectedLines: SelectedLineRange | null;
} {
  if (dropNext) {
    return { dropNext: false, selectedLines: null };
  }

  return { dropNext: false, selectedLines: range };
}

export function removeAnnotation(
  annotations: readonly DiffAnnotation[],
  annotationId: string
): readonly DiffAnnotation[] {
  return annotations.filter((annotation) => annotation.id !== annotationId);
}

/**
 * Annotations belong to the change scope they were created in, so switching
 * Unstaged/Staged/Committed never projects comments onto another dataset.
 */
export function annotationsForScope(
  annotations: readonly DiffAnnotation[],
  scope: GitChangeScope
): readonly DiffAnnotation[] {
  return annotations.filter((annotation) => annotation.scope === scope);
}

/**
 * Only attach an annotation to the live diff when the chosen snippet is still
 * present at its saved coordinates. Otherwise keep it orphaned in the sidebar.
 */
export function annotationMatchesFileDiff(
  annotation: Pick<DiffAnnotation, "codeDiff" | "filePath" | "range">,
  fileDiff: FileDiffMetadata
): boolean {
  return (
    annotation.filePath === fileDiff.name &&
    extractDiffSnippet(fileDiff, annotation.range) === annotation.codeDiff
  );
}

export function draftMatchesFileDiff(
  draft: Pick<AnnotationDraft, "codeDiff" | "filePath" | "range">,
  fileDiff: FileDiffMetadata
): boolean {
  return annotationMatchesFileDiff(draft, fileDiff);
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
