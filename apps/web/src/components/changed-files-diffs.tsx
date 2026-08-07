import { useAtom, useAtomValue } from "@effect/atom-react";
import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import { useLocation } from "@tanstack/react-router";
import { FileDiffIcon, FileWarningIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
} from "@/lib/file-diff-anchor";
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
