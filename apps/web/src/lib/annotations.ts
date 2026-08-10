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

export const sentAnnotationIdsAtom = Atom.make<ReadonlySet<string>>(
  new Set<string>()
);

export const annotationDraftAtom = Atom.make<AnnotationDraft | null>(null);

export const annotationsSidebarOpenAtom = Atom.make(false);

export const annotationFocusAtom = Atom.make<{
  readonly annotationId: string;
  readonly filePath: string;
} | null>(null);

export const createAnnotationId = (): string => crypto.randomUUID();

export const removeAnnotation = (
  annotations: readonly DiffAnnotation[],
  annotationId: string
): readonly DiffAnnotation[] =>
  annotations.filter((annotation) => annotation.id !== annotationId);

/**
 * Annotations belong to the change scope they were created in, so switching
 * Unstaged/Staged/Committed never projects comments onto another dataset.
 */
export const annotationsForScope = (
  annotations: readonly DiffAnnotation[],
  scope: GitChangeScope
): readonly DiffAnnotation[] =>
  annotations.filter((annotation) => annotation.scope === scope);

/**
 * Pending annotations that have not been posted to the remote pull request.
 */
export const unsentAnnotations = (
  annotations: readonly DiffAnnotation[],
  sentAnnotationIds: ReadonlySet<string>
): readonly DiffAnnotation[] =>
  annotations.filter((annotation) => !sentAnnotationIds.has(annotation.id));

export const markAnnotationsSent = (
  sentAnnotationIds: ReadonlySet<string>,
  annotationIds: readonly string[]
): ReadonlySet<string> => {
  const next = new Set(sentAnnotationIds);

  for (const annotationId of annotationIds) {
    next.add(annotationId);
  }

  return next;
};

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
