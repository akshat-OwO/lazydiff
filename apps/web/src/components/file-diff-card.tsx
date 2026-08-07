import { useAtom, useAtomValue } from "@effect/atom-react";
import type {
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectedLineRange,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { ChevronRightIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { AnnotationDraftForm } from "@/components/annotation-draft-form";
import { InlineAnnotationComment } from "@/components/inline-annotation-comment";
import { useTheme } from "@/components/theme-provider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  annotationAnchorForRange,
  extractDiffSnippet,
} from "@/lib/annotation-snippet";
import {
  annotationDraftAtom,
  annotationMatchesFileDiff,
  annotationsAtom,
  annotationsForScope,
  draftMatchesFileDiff,
  resolveAnnotationRange,
} from "@/lib/annotations";
import type { DiffAnnotation } from "@/lib/annotations";
import { fileDiffAnchorId } from "@/lib/file-diff-anchor";
import {
  countChangedLines,
  describeChangeWithoutHunks,
  describeModeChange,
} from "@/lib/file-diff-summary";
import { gitChangeScopeAtom } from "@/lib/rpc";
import { cn } from "@/lib/utils";

type AnnotationMetadata =
  | {
      readonly annotationId: string;
      readonly kind: "saved";
    }
  | {
      readonly kind: "draft";
    };

interface FileDiffCardProps {
  readonly fileDiff: FileDiffMetadata;
  readonly isCollapsed: boolean;
  readonly isHighlighterReady: boolean;
  readonly onToggle: (path: string) => void;
}

function FileDiffBody({
  changeWithoutHunks,
  fileDiff,
  isHighlighterReady,
  lineAnnotations,
  options,
  renderAnnotation,
  selectedLines,
}: {
  readonly changeWithoutHunks: string | null;
  readonly fileDiff: FileDiffMetadata;
  readonly isHighlighterReady: boolean;
  readonly lineAnnotations:
    | DiffLineAnnotation<AnnotationMetadata>[]
    | undefined;
  readonly options: {
    readonly diffStyle: "unified";
    readonly disableFileHeader: true;
    readonly enableGutterUtility: true;
    readonly enableLineSelection: true;
    readonly hunkSeparators: "line-info-basic";
    readonly onGutterUtilityClick: (range: SelectedLineRange) => void;
    readonly onLineSelected: (range: SelectedLineRange | null) => void;
    readonly overflow: "wrap";
    readonly themeType: "dark" | "light" | "system";
  };
  readonly renderAnnotation: (
    annotation: DiffLineAnnotation<AnnotationMetadata>
  ) => ReactNode;
  readonly selectedLines: SelectedLineRange | null;
}) {
  if (changeWithoutHunks !== null) {
    return (
      <p className="text-muted-foreground px-4 py-3 text-sm">
        {changeWithoutHunks}
      </p>
    );
  }

  if (!isHighlighterReady) {
    return (
      <div aria-label="Loading diff" className="space-y-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  return (
    <FileDiff
      fileDiff={fileDiff}
      options={options}
      renderAnnotation={renderAnnotation}
      selectedLines={selectedLines}
      {...(lineAnnotations === undefined ? {} : { lineAnnotations })}
    />
  );
}

function FileDiffCard({
  fileDiff,
  isCollapsed,
  isHighlighterReady,
  onToggle,
}: FileDiffCardProps) {
  const { theme } = useTheme();
  const scope = useAtomValue(gitChangeScopeAtom);
  const [draft, setDraft] = useAtom(annotationDraftAtom);
  const annotations = useAtomValue(annotationsAtom);
  const [selectedLines, setSelectedLines] = useState<SelectedLineRange | null>(
    null
  );
  // Pierre shrinks the utility-click range to the hovered line before invoking
  // onGutterUtilityClick. Keep the last committed selection in a ref so "+" can
  // still annotate the full highlighted range. A stable gutter callback also
  // avoids force-rendering the diff on every selection change.
  const committedSelectionRef = useRef<SelectedLineRange | null>(null);
  const dropNextLineSelectedRef = useRef(0);
  const scopedAnnotations = useMemo(
    () => annotationsForScope(annotations, scope),
    [annotations, scope]
  );
  const draftForFile =
    draft !== null &&
    draft.scope === scope &&
    draft.filePath === fileDiff.name &&
    draftMatchesFileDiff(draft, fileDiff)
      ? draft
      : null;
  const attachedForFile = useMemo(
    () =>
      scopedAnnotations.filter((annotation) =>
        annotationMatchesFileDiff(annotation, fileDiff)
      ),
    [fileDiff, scopedAnnotations]
  );
  const annotationsById = useMemo(() => {
    const map = new Map<
      string,
      { annotation: DiffAnnotation; number: number }
    >();

    for (const [index, annotation] of scopedAnnotations.entries()) {
      map.set(annotation.id, {
        annotation,
        number: index + 1,
      });
    }

    return map;
  }, [scopedAnnotations]);
  const { additions, deletions } = useMemo(
    () => countChangedLines(fileDiff),
    [fileDiff]
  );
  const modeChange = useMemo(() => describeModeChange(fileDiff), [fileDiff]);
  const changeWithoutHunks = useMemo(
    () => describeChangeWithoutHunks(fileDiff),
    [fileDiff]
  );

  const onGutterUtilityClick = useCallback(
    (range: SelectedLineRange) => {
      const effectiveRange = resolveAnnotationRange(
        range,
        committedSelectionRef.current
      );
      const anchor = annotationAnchorForRange(effectiveRange);
      // Drop Pierre's follow-up onLineSelected commit (and a possible notify from
      // syncing selectedLines=null into the controlled FileDiff).
      dropNextLineSelectedRef.current = 2;
      committedSelectionRef.current = null;
      setDraft({
        codeDiff: extractDiffSnippet(fileDiff, effectiveRange),
        filePath: fileDiff.name,
        lineNumber: anchor.lineNumber,
        range: effectiveRange,
        scope,
        side: anchor.side,
      });
      setSelectedLines(null);
    },
    [fileDiff, scope, setDraft]
  );

  const onLineSelected = useCallback((range: SelectedLineRange | null) => {
    if (dropNextLineSelectedRef.current > 0) {
      dropNextLineSelectedRef.current -= 1;
      setSelectedLines(null);
      return;
    }

    committedSelectionRef.current = range;
    setSelectedLines(range);
  }, []);

  const options = useMemo(
    () => ({
      diffStyle: "unified" as const,
      disableFileHeader: true as const,
      enableGutterUtility: true as const,
      enableLineSelection: true as const,
      hunkSeparators: "line-info-basic" as const,
      onGutterUtilityClick,
      onLineSelected,
      overflow: "wrap" as const,
      themeType: theme,
    }),
    [onGutterUtilityClick, onLineSelected, theme]
  );

  const lineAnnotations = useMemo(() => {
    const next: DiffLineAnnotation<AnnotationMetadata>[] = attachedForFile.map(
      (annotation) => {
        const anchor = annotationAnchorForRange(annotation.range);

        return {
          lineNumber: anchor.lineNumber,
          metadata: {
            annotationId: annotation.id,
            kind: "saved" as const,
          },
          side: anchor.side,
        };
      }
    );

    if (draftForFile !== null) {
      next.push({
        lineNumber: draftForFile.lineNumber,
        metadata: { kind: "draft" },
        side: draftForFile.side,
      });
    }

    return next.length === 0 ? undefined : next;
  }, [attachedForFile, draftForFile]);

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<AnnotationMetadata>) => {
      if (annotation.metadata.kind === "draft") {
        return draftForFile === null ? null : (
          <AnnotationDraftForm draft={draftForFile} />
        );
      }

      const saved = annotationsById.get(annotation.metadata.annotationId);

      if (saved === undefined) {
        return null;
      }

      return (
        <InlineAnnotationComment
          annotationId={saved.annotation.id}
          comment={saved.annotation.comment}
          number={saved.number}
        />
      );
    },
    [annotationsById, draftForFile]
  );

  return (
    <section
      className="scroll-mt-14 border-b"
      id={fileDiffAnchorId(fileDiff.name)}
    >
      <button
        aria-expanded={!isCollapsed}
        className="bg-muted sticky top-14 z-10 flex w-full items-center gap-2 border-b px-4 py-2 text-left"
        onClick={() => onToggle(fileDiff.name)}
        type="button"
      >
        <ChevronRightIcon
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform",
            !isCollapsed && "rotate-90"
          )}
        />
        <span className="truncate font-mono text-xs">
          {fileDiff.prevName === undefined
            ? fileDiff.name
            : `${fileDiff.prevName} → ${fileDiff.name}`}
        </span>
        {modeChange !== null && (
          <span className="text-muted-foreground shrink-0 font-mono text-xs">
            {modeChange}
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-xs">
          <span className="text-destructive">-{deletions}</span>{" "}
          <span className="text-emerald-600 dark:text-emerald-400">
            +{additions}
          </span>
        </span>
      </button>
      {!isCollapsed && (
        <FileDiffBody
          changeWithoutHunks={changeWithoutHunks}
          fileDiff={fileDiff}
          isHighlighterReady={isHighlighterReady}
          lineAnnotations={lineAnnotations}
          options={options}
          renderAnnotation={renderAnnotation}
          selectedLines={selectedLines}
        />
      )}
    </section>
  );
}

export { FileDiffCard };
