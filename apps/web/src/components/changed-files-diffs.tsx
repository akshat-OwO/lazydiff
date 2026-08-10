import { useAtom, useAtomValue } from "@effect/atom-react";
import type {
  CodeViewDiffItem,
  CodeViewItem,
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectedLineRange,
} from "@pierre/diffs";
import { CodeView } from "@pierre/diffs/react";
import type { CodeViewHandle } from "@pierre/diffs/react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronRightIcon, FileDiffIcon, FileWarningIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { AnnotationDraftForm } from "@/components/annotation-draft-form";
import { InlineAnnotationComment } from "@/components/inline-annotation-comment";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  annotationAnchorForRange,
  extractDiffSnippet,
} from "@/lib/annotation-snippet";
import {
  annotationDraftAtom,
  annotationFocusAtom,
  annotationMatchesFileDiff,
  annotationsAtom,
  annotationsForScope,
  draftMatchesFileDiff,
} from "@/lib/annotations";
import type { DiffAnnotation } from "@/lib/annotations";
import {
  annotationInlineAnchorId,
  fileDiffAnchorId,
  fromLocationHash,
  toLocationHash,
} from "@/lib/file-diff-anchor";
import {
  countChangedLines,
  describeChangeWithoutHunks,
  describeModeChange,
} from "@/lib/file-diff-summary";
import { preloadFileDiffHighlighter } from "@/lib/preload-file-diff-highlighter";
import { gitChangeScopeAtom, gitDiffAtom } from "@/lib/rpc";
import { cn } from "@/lib/utils";

const emptyFileDiffs: readonly FileDiffMetadata[] = [];

type AnnotationMetadata =
  | {
      readonly annotationId: string;
      readonly kind: "saved";
    }
  | {
      readonly kind: "draft";
    };

const gutterUtilityCSS = `
[data-column-number] {
  padding-left: calc(1lh + 1ch);
}

[data-gutter-utility-slot] {
  left: 4px;
  right: auto;
  justify-content: flex-start;
}

[data-utility-button] {
  margin-right: 0;
}
`;

interface CachedCodeViewItem {
  readonly annotations: DiffLineAnnotation<AnnotationMetadata>[] | undefined;
  readonly collapsed: boolean;
  readonly item: CodeViewDiffItem<AnnotationMetadata>;
  readonly version: number;
}

/**
 * Keyed by the parsed file diff, which is created once per sync, so item
 * identity survives re-renders while later batches stream in. CodeView compares
 * items by reference to take its append-only update path.
 */
const codeViewItems = new WeakMap<FileDiffMetadata, CachedCodeViewItem>();

const resolveCodeViewItem = (
  fileDiff: FileDiffMetadata,
  collapsed: boolean,
  annotations: DiffLineAnnotation<AnnotationMetadata>[] | undefined,
  version: number
): CodeViewDiffItem<AnnotationMetadata> => {
  const cached = codeViewItems.get(fileDiff);

  if (
    cached !== undefined &&
    cached.collapsed === collapsed &&
    cached.annotations === annotations &&
    cached.version === version
  ) {
    return cached.item;
  }

  const item: CodeViewDiffItem<AnnotationMetadata> = {
    collapsed,
    fileDiff,
    id: fileDiffAnchorId(fileDiff.name),
    type: "diff",
    version,
    ...(annotations === undefined ? {} : { annotations }),
  };

  codeViewItems.set(fileDiff, { annotations, collapsed, item, version });

  return item;
};

function ChangedFilesDiffs() {
  const gitDiff = useAtomValue(gitDiffAtom);
  const annotations = useAtomValue(annotationsAtom);
  const [annotationFocus, setAnnotationFocus] = useAtom(annotationFocusAtom);
  const [draft, setDraft] = useAtom(annotationDraftAtom);
  const scope = useAtomValue(gitChangeScopeAtom);
  const { theme } = useTheme();
  const navigate = useNavigate();
  const selectedPath = useLocation({
    select: (location) => fromLocationHash(location.hash),
  });
  const codeViewRef = useRef<CodeViewHandle<AnnotationMetadata>>(null);
  const scrolledPath = useRef<string | null>(null);
  const [collapsedPaths, setCollapsedPaths] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [collapseSource, setCollapseSource] = useState(0);
  const [itemVersions, setItemVersions] = useState<ReadonlyMap<string, number>>(
    () => new Map()
  );
  const [highlighterReadyGeneration, setHighlighterReadyGeneration] = useState<
    number | null
  >(null);
  const [highlighterFailedGeneration, setHighlighterFailedGeneration] =
    useState<number | null>(null);
  const [preloadAttempt, setPreloadAttempt] = useState(0);

  const fileDiffs =
    gitDiff._tag === "Success" ? gitDiff.value.fileDiffs : emptyFileDiffs;
  const complete = gitDiff._tag === "Success" ? gitDiff.value.complete : true;
  const generation = gitDiff._tag === "Success" ? gitDiff.value.generation : 0;

  // A new generation is a fresh sync, so per-file view state starts over.
  if (generation !== collapseSource) {
    setCollapseSource(generation);
    setCollapsedPaths(new Set());
    setItemVersions(new Map());
  }

  const scopedAnnotations = useMemo(
    () => annotationsForScope(annotations, scope),
    [annotations, scope]
  );

  const annotationsById = useMemo(() => {
    const map = new Map<
      string,
      { annotation: DiffAnnotation; number: number }
    >();

    for (let index = 0; index < scopedAnnotations.length; index += 1) {
      const annotation = scopedAnnotations[index];

      if (annotation === undefined) {
        continue;
      }

      map.set(annotation.id, {
        annotation,
        number: index + 1,
      });
    }

    return map;
  }, [scopedAnnotations]);

  /**
   * Only annotated files land in this map, so the per-file lookup below stays a
   * reference comparison for the thousands of files that carry no annotations.
   */
  const annotationsByFile = useMemo(() => {
    const map = new Map<
      FileDiffMetadata,
      DiffLineAnnotation<AnnotationMetadata>[]
    >();

    const append = (
      fileDiff: FileDiffMetadata,
      annotation: DiffLineAnnotation<AnnotationMetadata>
    ) => {
      const existing = map.get(fileDiff);

      if (existing === undefined) {
        map.set(fileDiff, [annotation]);
        return;
      }

      existing.push(annotation);
    };

    if (scopedAnnotations.length > 0 || draft !== null) {
      for (const fileDiff of fileDiffs) {
        for (const annotation of scopedAnnotations) {
          if (!annotationMatchesFileDiff(annotation, fileDiff)) {
            continue;
          }

          const anchor = annotationAnchorForRange(annotation.range);
          append(fileDiff, {
            lineNumber: anchor.lineNumber,
            metadata: { annotationId: annotation.id, kind: "saved" },
            side: anchor.side,
          });
        }

        if (
          draft !== null &&
          draft.scope === scope &&
          draft.filePath === fileDiff.name &&
          draftMatchesFileDiff(draft, fileDiff)
        ) {
          append(fileDiff, {
            lineNumber: draft.lineNumber,
            metadata: { kind: "draft" },
            side: draft.side,
          });
        }
      }
    }

    return map;
  }, [draft, fileDiffs, scope, scopedAnnotations]);

  const items = useMemo(
    () =>
      fileDiffs.map((fileDiff) =>
        resolveCodeViewItem(
          fileDiff,
          annotationFocus?.filePath === fileDiff.name
            ? false
            : collapsedPaths.has(fileDiff.name),
          annotationsByFile.get(fileDiff),
          itemVersions.get(fileDiffAnchorId(fileDiff.name)) ?? 0
        )
      ),
    [
      annotationFocus?.filePath,
      annotationsByFile,
      collapsedPaths,
      fileDiffs,
      itemVersions,
    ]
  );

  // Readiness is tracked per sync, not per batch, so later batches never take
  // the pane back to a loading state while files are still streaming in.
  const isHighlighterReady = highlighterReadyGeneration === generation;
  const isHighlighterFailed = highlighterFailedGeneration === generation;

  useEffect(() => {
    if (fileDiffs.length === 0) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        await preloadFileDiffHighlighter(fileDiffs);
        if (!cancelled) {
          setHighlighterReadyGeneration(generation);
          setHighlighterFailedGeneration(null);
        }
      } catch {
        if (!cancelled) {
          setHighlighterFailedGeneration(generation);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileDiffs, generation, preloadAttempt]);

  useEffect(() => {
    if (selectedPath === null) {
      scrolledPath.current = null;
      return;
    }

    if (scrolledPath.current === selectedPath || !isHighlighterReady) {
      return;
    }

    scrolledPath.current = selectedPath;
    codeViewRef.current?.scrollTo({
      align: "start",
      behavior: "instant",
      id: fileDiffAnchorId(selectedPath),
      type: "item",
    });
  }, [isHighlighterReady, selectedPath]);

  useEffect(() => {
    if (annotationFocus === null || !isHighlighterReady) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const anchor = document.querySelector(
        `#${CSS.escape(annotationInlineAnchorId(annotationFocus.annotationId))}`
      );

      if (anchor instanceof HTMLElement) {
        anchor.scrollIntoView({ behavior: "instant", block: "center" });
      }

      setAnnotationFocus(null);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [annotationFocus, isHighlighterReady, setAnnotationFocus]);

  const onGutterUtilityClick = useCallback(
    (
      range: SelectedLineRange,
      context: { readonly item: CodeViewItem<AnnotationMetadata> }
    ) => {
      const { item } = context;

      if (item.type !== "diff") {
        return;
      }

      const anchor = annotationAnchorForRange(range);
      setDraft({
        codeDiff: extractDiffSnippet(item.fileDiff, range),
        filePath: item.fileDiff.name,
        lineNumber: anchor.lineNumber,
        range,
        scope,
        side: anchor.side,
      });
      void navigate({
        hash: toLocationHash(item.fileDiff.name),
        hashScrollIntoView: false,
        replace: true,
        resetScroll: false,
        to: "/",
      });
    },
    [navigate, scope, setDraft]
  );

  const toggleCollapsed = useCallback(
    (item: CodeViewDiffItem<AnnotationMetadata>) => {
      setCollapsedPaths((paths) => {
        const next = new Set(paths);

        if (next.has(item.fileDiff.name)) {
          next.delete(item.fileDiff.name);
        } else {
          next.add(item.fileDiff.name);
        }

        return next;
      });
      setItemVersions(
        (versions) =>
          new Map([
            ...versions,
            [item.id, (versions.get(item.id) ?? item.version ?? 0) + 1],
          ])
      );
    },
    []
  );

  const renderCustomHeader = useCallback(
    (item: CodeViewItem<AnnotationMetadata>) => {
      if (item.type !== "diff") {
        return null;
      }

      const { additions, deletions } = countChangedLines(item.fileDiff);
      const modeChange = describeModeChange(item.fileDiff);
      const changeWithoutHunks = describeChangeWithoutHunks(item.fileDiff);

      return (
        <button
          aria-expanded={!item.collapsed}
          className="bg-muted flex w-full items-center gap-2 px-4 py-2 text-left"
          onClick={() => {
            toggleCollapsed(item);
          }}
          type="button"
        >
          <ChevronRightIcon
            className={cn(
              "text-muted-foreground size-4 shrink-0 transition-transform",
              !item.collapsed && "rotate-90"
            )}
          />
          <span className="truncate font-mono text-xs">
            {item.fileDiff.prevName === undefined
              ? item.fileDiff.name
              : `${item.fileDiff.prevName} → ${item.fileDiff.name}`}
          </span>
          {modeChange !== null && (
            <span className="text-muted-foreground shrink-0 font-mono text-xs">
              {modeChange}
            </span>
          )}
          {changeWithoutHunks !== null && item.collapsed && (
            <span className="text-muted-foreground hidden truncate text-xs sm:inline">
              {changeWithoutHunks}
            </span>
          )}
          <span className="ml-auto shrink-0 font-mono text-xs">
            <span className="text-destructive">-{deletions}</span>{" "}
            <span className="text-emerald-600 dark:text-emerald-400">
              +{additions}
            </span>
          </span>
        </button>
      );
    },
    [toggleCollapsed]
  );

  const renderAnnotation = useCallback(
    (
      annotation: DiffLineAnnotation<AnnotationMetadata>,
      item: CodeViewItem<AnnotationMetadata>
    ): ReactNode => {
      if (item.type !== "diff") {
        return null;
      }

      if (annotation.metadata.kind === "draft") {
        return draft !== null &&
          draft.filePath === item.fileDiff.name &&
          draft.scope === scope ? (
          <AnnotationDraftForm draft={draft} />
        ) : null;
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
    [annotationsById, draft, scope]
  );

  const codeViewOptions = useMemo(
    () => ({
      diffStyle: "unified" as const,
      disableFileHeader: true as const,
      enableGutterUtility: true as const,
      enableLineSelection: true as const,
      hunkSeparators: "line-info-basic" as const,
      layout: {
        gap: 0,
        paddingBottom: 0,
        paddingTop: 0,
      },
      onGutterUtilityClick,
      overflow: "wrap" as const,
      stickyHeaders: true,
      themeType: theme,
      unsafeCSS: gutterUtilityCSS,
    }),
    [onGutterUtilityClick, theme]
  );

  const retryHighlighterPreload = useCallback(() => {
    setPreloadAttempt((attempt) => attempt + 1);
  }, []);

  if (gitDiff._tag === "Initial" && fileDiffs.length === 0) {
    return (
      <div
        aria-label="Loading diffs"
        className="h-full space-y-3 overflow-y-auto p-4"
      >
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (gitDiff._tag === "Failure" && fileDiffs.length === 0) {
    return (
      <Empty className="h-full overflow-y-auto">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileWarningIcon />
          </EmptyMedia>
          <EmptyTitle>Diffs unavailable</EmptyTitle>
          <EmptyDescription>The Git diff could not be read.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (fileDiffs.length === 0 && complete) {
    return (
      <Empty className="h-full overflow-y-auto">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileDiffIcon />
          </EmptyMedia>
          <EmptyTitle>No changes to review</EmptyTitle>
          <EmptyDescription>
            Changed files show up here as soon as the working tree differs from
            the selected scope.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (isHighlighterFailed) {
    return (
      <Empty className="h-full overflow-y-auto">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileWarningIcon />
          </EmptyMedia>
          <EmptyTitle>Diffs unavailable</EmptyTitle>
          <EmptyDescription>
            Syntax highlighting could not be loaded for these changes.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={retryHighlighterPreload} type="button">
            Retry
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="absolute inset-0" data-slot="file-diffs-scrollport">
      {!isHighlighterReady && (
        <div
          aria-label="Loading diffs"
          className="bg-background/80 absolute inset-0 z-10 space-y-3 overflow-y-auto p-4"
        >
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}
      <CodeView
        className="h-full overflow-auto"
        items={items}
        options={codeViewOptions}
        ref={codeViewRef}
        renderAnnotation={renderAnnotation}
        renderCustomHeader={renderCustomHeader}
      />
      {!complete && (
        <p className="text-muted-foreground bg-background/90 pointer-events-none absolute inset-x-0 bottom-0 px-4 py-2 text-sm">
          Loading more files… ({fileDiffs.length} loaded)
        </p>
      )}
    </div>
  );
}

export { ChangedFilesDiffs };
