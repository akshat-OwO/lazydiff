import { useAtom, useAtomValue } from "@effect/atom-react";
import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { FileDiffIcon, FileWarningIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIEventHandler } from "react";

import { FileDiffCard } from "@/components/file-diff-card";
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
import { annotationFocusAtom } from "@/lib/annotations";
import {
  annotationInlineAnchorId,
  fileDiffAnchorId,
  fromLocationHash,
  toLocationHash,
} from "@/lib/file-diff-anchor";
import { findInViewFilePath } from "@/lib/file-diff-in-view";
import type { FileDiffSectionContentOffset } from "@/lib/file-diff-in-view";
import { unquoteGitPath } from "@/lib/git-path";
import { preloadFileDiffHighlighter } from "@/lib/preload-file-diff-highlighter";
import { gitDiffAtom } from "@/lib/rpc";

const withoutPath = (paths: ReadonlySet<string>, path: string) => {
  const next = new Set(paths);
  next.delete(path);
  return next;
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

  return fileDiffs.flatMap((fileDiff) => {
    const element = elementsById.get(fileDiffAnchorId(fileDiff.name));

    if (element === undefined) {
      return [];
    }

    return [
      {
        contentTop:
          element.getBoundingClientRect().top - scrollportTop + scrollTop,
        path: fileDiff.name,
      },
    ];
  });
};

type HighlighterPreloadState =
  | {
      readonly _tag: "Ready";
      readonly attempt: number;
      readonly fileDiffs: readonly FileDiffMetadata[];
    }
  | {
      readonly _tag: "Failed";
      readonly attempt: number;
      readonly fileDiffs: readonly FileDiffMetadata[];
    };

function ChangedFilesDiffs() {
  const gitDiff = useAtomValue(gitDiffAtom);
  const [annotationFocus, setAnnotationFocus] = useAtom(annotationFocusAtom);
  const navigate = useNavigate();
  const selectedPath = useLocation({
    select: (location) => fromLocationHash(location.hash),
  });
  const [collapsedPaths, setCollapsedPaths] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const patch = gitDiff._tag === "Success" ? gitDiff.value.data.patch : "";
  const fileDiffs = useMemo(
    () =>
      patch.length === 0
        ? []
        : parsePatchFiles(patch)
            .flatMap(({ files }) => files)
            .map((fileDiff) => {
              // The parser keeps the pathname exactly as the patch header
              // spells it, which the tree and the hash cannot match.
              fileDiff.name = unquoteGitPath(fileDiff.name);

              if (fileDiff.prevName !== undefined) {
                fileDiff.prevName = unquoteGitPath(fileDiff.prevName);
              }

              return fileDiff;
            })
            .toSorted((left, right) => left.name.localeCompare(right.name)),
    [patch]
  );
  const [highlighterPreload, setHighlighterPreload] =
    useState<HighlighterPreloadState | null>(null);
  const [preloadAttempt, setPreloadAttempt] = useState(0);
  const isHighlighterReady =
    highlighterPreload?._tag === "Ready" &&
    highlighterPreload.fileDiffs === fileDiffs &&
    highlighterPreload.attempt === preloadAttempt;
  const isHighlighterFailed =
    highlighterPreload?._tag === "Failed" &&
    highlighterPreload.fileDiffs === fileDiffs &&
    highlighterPreload.attempt === preloadAttempt;
  const scrolledPath = useRef<string | null>(null);
  const scrollFrame = useRef(0);
  // Ignore scrollspy while hash-driven scrollIntoView is relocating the pane.
  const ignoreScrollSpy = useRef(false);
  const scrollportRef = useRef<HTMLDivElement | null>(null);
  // Content tops are measured only when layout changes, not on every frame.
  const sectionContentTops = useRef<
    readonly FileDiffSectionContentOffset[] | null
  >(null);

  useEffect(() => {
    if (fileDiffs.length === 0) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        await preloadFileDiffHighlighter(fileDiffs);
        if (!cancelled) {
          setHighlighterPreload({
            _tag: "Ready",
            attempt: preloadAttempt,
            fileDiffs,
          });
        }
      } catch {
        if (!cancelled) {
          setHighlighterPreload({
            _tag: "Failed",
            attempt: preloadAttempt,
            fileDiffs,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileDiffs, preloadAttempt]);

  // Scroll once per selection after real diff heights are in the DOM. Skeletons
  // are short, so scrolling earlier lands on the wrong place once FileDiff
  // mounts. Repository refreshes keep the same selection and must not yank
  // the reader back to that file.
  useEffect(() => {
    if (selectedPath === null) {
      scrolledPath.current = null;
      return;
    }

    if (scrolledPath.current === selectedPath || !isHighlighterReady) {
      return;
    }

    const anchor = document.querySelector(
      `#${CSS.escape(fileDiffAnchorId(selectedPath))}`
    );

    if (anchor === null) {
      return;
    }

    ignoreScrollSpy.current = true;
    scrolledPath.current = selectedPath;
    anchor.scrollIntoView({ behavior: "instant", block: "start" });
    window.requestAnimationFrame(() => {
      ignoreScrollSpy.current = false;
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

  useEffect(() => {
    sectionContentTops.current = null;
  }, [collapsedPaths, fileDiffs, isHighlighterReady]);

  useEffect(() => {
    const scrollport = scrollportRef.current;

    if (scrollport === null || !isHighlighterReady || fileDiffs.length === 0) {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      sectionContentTops.current = null;
    });

    resizeObserver.observe(scrollport);

    for (const child of scrollport.children) {
      if (child instanceof HTMLElement) {
        resizeObserver.observe(child);
      }
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [collapsedPaths, fileDiffs, isHighlighterReady]);

  const onDiffsScroll = useCallback<UIEventHandler<HTMLDivElement>>(
    (event) => {
      const scrollport = event.currentTarget;

      if (scrollFrame.current !== 0) {
        return;
      }

      scrollFrame.current = window.requestAnimationFrame(() => {
        scrollFrame.current = 0;

        if (
          ignoreScrollSpy.current ||
          !isHighlighterReady ||
          fileDiffs.length === 0
        ) {
          return;
        }

        const sections =
          sectionContentTops.current ??
          measureSectionContentTops(scrollport, fileDiffs);
        sectionContentTops.current = sections;

        if (sections.length === 0) {
          return;
        }

        const isScrolledToBottom =
          scrollport.scrollTop + scrollport.clientHeight >=
          scrollport.scrollHeight - 1;
        const inViewPath = findInViewFilePath(sections, {
          activationOffset: 0,
          isScrolledToBottom,
          scrollTop: scrollport.scrollTop,
        });

        if (inViewPath === null || inViewPath === scrolledPath.current) {
          return;
        }

        // Mark the path as already in view so the hash scroll effect is a no-op.
        scrolledPath.current = inViewPath;
        void navigate({
          hash: toLocationHash(inViewPath),
          hashScrollIntoView: false,
          replace: true,
          resetScroll: false,
          to: "/",
        });
      });
    },
    [fileDiffs, isHighlighterReady, navigate]
  );

  const toggleCollapsed = useCallback((path: string) => {
    setCollapsedPaths((paths) =>
      paths.has(path) ? withoutPath(paths, path) : new Set(paths).add(path)
    );
  }, []);

  const isPathCollapsed = useCallback(
    (path: string) => {
      if (annotationFocus?.filePath === path) {
        return false;
      }

      return collapsedPaths.has(path);
    },
    [annotationFocus, collapsedPaths]
  );

  const retryHighlighterPreload = useCallback(() => {
    setPreloadAttempt((attempt) => attempt + 1);
  }, []);

  if (gitDiff._tag === "Initial") {
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

  if (gitDiff._tag === "Failure") {
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

  if (fileDiffs.length === 0) {
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
    <div
      className="absolute inset-0 overflow-y-auto"
      data-slot="file-diffs-scrollport"
      onScroll={onDiffsScroll}
      ref={scrollportRef}
    >
      {fileDiffs.map((fileDiff) => (
        <FileDiffCard
          fileDiff={fileDiff}
          isCollapsed={isPathCollapsed(fileDiff.name)}
          isHighlighterReady={isHighlighterReady}
          key={fileDiff.name}
          onToggle={toggleCollapsed}
        />
      ))}
    </div>
  );
}

export { ChangedFilesDiffs };
