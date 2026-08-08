import { useAtom, useAtomValue } from "@effect/atom-react";
import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { FileDiffIcon, FileWarningIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
import {
  FILE_DIFF_STICKY_OFFSET_REM,
  findInViewFilePath,
} from "@/lib/file-diff-in-view";
import { unquoteGitPath } from "@/lib/git-path";
import { preloadFileDiffHighlighter } from "@/lib/preload-file-diff-highlighter";
import { gitDiffAtom } from "@/lib/rpc";

const withoutPath = (paths: ReadonlySet<string>, path: string) => {
  const next = new Set(paths);
  next.delete(path);
  return next;
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
  const selectedPathRef = useRef(selectedPath);

  useLayoutEffect(() => {
    selectedPathRef.current = selectedPath;
  }, [selectedPath]);

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

    scrolledPath.current = selectedPath;
    anchor.scrollIntoView({ behavior: "instant", block: "start" });
  }, [isHighlighterReady, selectedPath]);

  // Keep the location hash (and therefore the sidebar tree selection) aligned
  // with the file currently under the sticky header while the reader scrolls.
  useEffect(() => {
    if (!isHighlighterReady || fileDiffs.length === 0) {
      return;
    }

    let frame = 0;

    const syncInViewFile = () => {
      const pendingSelection = selectedPathRef.current;

      // Sidebar clicks and history navigation update the hash before the
      // matching scroll completes. Do not overwrite that target mid-flight.
      if (
        pendingSelection !== null &&
        scrolledPath.current !== pendingSelection
      ) {
        return;
      }

      const rootFontSizeMatch = /^(?<size>[\d.]+)px$/u.exec(
        getComputedStyle(document.documentElement).fontSize
      );
      const rootFontSize = Number(rootFontSizeMatch?.groups?.size ?? 16);
      const activationOffset = FILE_DIFF_STICKY_OFFSET_REM * rootFontSize;
      const sections = fileDiffs.flatMap((fileDiff) => {
        const element = document.querySelector(
          `#${CSS.escape(fileDiffAnchorId(fileDiff.name))}`
        );

        if (!(element instanceof HTMLElement)) {
          return [];
        }

        return [
          {
            path: fileDiff.name,
            top: element.getBoundingClientRect().top,
          },
        ];
      });
      const isScrolledToBottom =
        window.scrollY + window.innerHeight >=
        document.documentElement.scrollHeight - 1;
      const inViewPath = findInViewFilePath(sections, {
        activationOffset,
        isScrolledToBottom,
      });

      if (inViewPath === null || inViewPath === selectedPathRef.current) {
        return;
      }

      // Mark the path as already in view so the hash scroll effect is a no-op.
      scrolledPath.current = inViewPath;
      selectedPathRef.current = inViewPath;
      void navigate({
        hash: toLocationHash(inViewPath),
        hashScrollIntoView: false,
        replace: true,
        resetScroll: false,
        to: "/",
      });
    };

    const onScroll = () => {
      if (frame !== 0) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncInViewFile();
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);

      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [fileDiffs, isHighlighterReady, navigate]);

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
      <div aria-label="Loading diffs" className="space-y-3 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (gitDiff._tag === "Failure") {
    return (
      <Empty className="min-h-[60svh]">
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
      <Empty className="min-h-[60svh]">
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
      <Empty className="min-h-[60svh]">
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
    <div>
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
