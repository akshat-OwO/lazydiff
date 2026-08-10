import { useAtom, useAtomValue } from "@effect/atom-react";
import type { FileDiffMetadata } from "@pierre/diffs";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { UIEventHandler } from "react";

import {
  measureSectionContentTops,
  parseFileDiffsFromPatch,
  withoutPath,
} from "@/components/changed-files-diffs-helpers";
import {
  annotationDraftAtom,
  annotationFocusAtom,
  annotationsAtom,
} from "@/lib/annotations";
import {
  annotationInlineAnchorId,
  fileDiffAnchorId,
  fromLocationHash,
  toLocationHash,
} from "@/lib/file-diff-anchor";
import { findInViewFilePath } from "@/lib/file-diff-in-view";
import { preloadFileDiffHighlighter } from "@/lib/preload-file-diff-highlighter";
import { gitDiffAtom } from "@/lib/rpc";

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

const useChangedFilesDiffs = () => {
  const gitDiff = useAtomValue(gitDiffAtom);
  const annotations = useAtomValue(annotationsAtom);
  const annotationDraft = useAtomValue(annotationDraftAtom);
  const [annotationFocus, setAnnotationFocus] = useAtom(annotationFocusAtom);
  const navigate = useNavigate();
  const selectedPath = useLocation({
    select: (location) => fromLocationHash(location.hash),
  });
  const [collapsedPaths, setCollapsedPaths] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const patch = gitDiff._tag === "Success" ? gitDiff.value.data.patch : "";
  const fileDiffs = useMemo(() => parseFileDiffsFromPatch(patch), [patch]);
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
  const sectionContentTops = useRef<{
    readonly key: string;
    readonly sections: ReturnType<typeof measureSectionContentTops>;
  } | null>(null);
  const sectionLayoutKey = useMemo(() => {
    const collapsedKey = [...collapsedPaths].toSorted().join("\n");
    const fileKey = fileDiffs.map((fileDiff) => fileDiff.name).join("\n");
    const focusKey =
      annotationFocus === null
        ? ""
        : `${annotationFocus.filePath}\0${annotationFocus.annotationId}`;
    const annotationsKey = annotations
      .map(
        (annotation) =>
          `${annotation.id}\0${annotation.filePath}\0${annotation.comment.length}`
      )
      .join("\n");
    const draftKey =
      annotationDraft === null
        ? ""
        : `${annotationDraft.filePath}\0${annotationDraft.lineNumber}\0${annotationDraft.codeDiff.length}`;

    return `${isHighlighterReady ? "1" : "0"}\n${fileKey}\n${collapsedKey}\n${focusKey}\n${annotationsKey}\n${draftKey}`;
  }, [
    annotationDraft,
    annotationFocus,
    annotations,
    collapsedPaths,
    fileDiffs,
    isHighlighterReady,
  ]);

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

  // Invalidate before paint so collapse/expand scroll anchoring cannot reuse
  // offsets from the previous layout.
  useLayoutEffect(() => {
    sectionContentTops.current = null;

    if (scrollFrame.current !== 0) {
      window.cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = 0;
    }
  }, [sectionLayoutKey]);

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

        const cached = sectionContentTops.current;
        const sections =
          cached !== null && cached.key === sectionLayoutKey
            ? cached.sections
            : measureSectionContentTops(scrollport, fileDiffs);
        sectionContentTops.current = {
          key: sectionLayoutKey,
          sections,
        };

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
    [fileDiffs, isHighlighterReady, navigate, sectionLayoutKey]
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

  return {
    fileDiffs,
    gitDiff,
    isHighlighterFailed,
    isHighlighterReady,
    isPathCollapsed,
    onDiffsScroll,
    retryHighlighterPreload,
    scrollportRef,
    toggleCollapsed,
  };
};

export { useChangedFilesDiffs };
