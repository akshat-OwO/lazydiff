import { useAtom, useAtomSet } from "@effect/atom-react";
import type {
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectedLineRange,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { ChevronRightIcon } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";

import { AnnotationDraftForm } from "@/components/annotation-draft-form";
import { useTheme } from "@/components/theme-provider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  annotationAnchorForRange,
  extractDiffSnippet,
} from "@/lib/annotation-snippet";
import {
  annotationDraftAtom,
  annotationsSidebarOpenAtom,
} from "@/lib/annotations";
import { fileDiffAnchorId } from "@/lib/file-diff-anchor";
import {
  countChangedLines,
  describeChangeWithoutHunks,
  describeModeChange,
} from "@/lib/file-diff-summary";
import { cn } from "@/lib/utils";

interface AnnotationMetadata {
  readonly kind: "draft";
}

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
    readonly hunkSeparators: "line-info-basic";
    readonly onGutterUtilityClick: (range: SelectedLineRange) => void;
    readonly overflow: "wrap";
    readonly themeType: "dark" | "light" | "system";
  };
  readonly renderAnnotation: (
    annotation: DiffLineAnnotation<AnnotationMetadata>
  ) => ReactNode;
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
  const [draft, setDraft] = useAtom(annotationDraftAtom);
  const setSidebarOpen = useAtomSet(annotationsSidebarOpenAtom);
  const draftForFile = draft?.filePath === fileDiff.name ? draft : null;
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
      const anchor = annotationAnchorForRange(range);
      setDraft({
        codeDiff: extractDiffSnippet(fileDiff, range),
        filePath: fileDiff.name,
        lineNumber: anchor.lineNumber,
        range,
        side: anchor.side,
      });
      setSidebarOpen(true);
    },
    [fileDiff, setDraft, setSidebarOpen]
  );

  const options = useMemo(
    () => ({
      diffStyle: "unified" as const,
      disableFileHeader: true as const,
      enableGutterUtility: true as const,
      hunkSeparators: "line-info-basic" as const,
      onGutterUtilityClick,
      overflow: "wrap" as const,
      themeType: theme,
    }),
    [onGutterUtilityClick, theme]
  );

  const lineAnnotations = useMemo(() => {
    if (draftForFile === null) {
      return;
    }

    return [
      {
        lineNumber: draftForFile.lineNumber,
        metadata: { kind: "draft" as const },
        side: draftForFile.side,
      },
    ];
  }, [draftForFile]);

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<AnnotationMetadata>) => {
      if (annotation.metadata.kind !== "draft" || draftForFile === null) {
        return null;
      }

      return <AnnotationDraftForm draft={draftForFile} />;
    },
    [draftForFile]
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
        />
      )}
    </section>
  );
}

export { FileDiffCard };
