import { useAtomValue } from "@effect/atom-react";
import { parsePatchFiles } from "@pierre/diffs";
import { useLocation } from "@tanstack/react-router";
import { FileDiffIcon, FileWarningIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FileDiffCard } from "@/components/file-diff-card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { fileDiffAnchorId, fromLocationHash } from "@/lib/file-diff-anchor";
import { unquoteGitPath } from "@/lib/git-path";
import { gitDiffAtom } from "@/lib/rpc";

const withoutPath = (paths: ReadonlySet<string>, path: string) => {
  const next = new Set(paths);
  next.delete(path);
  return next;
};

function ChangedFilesDiffs() {
  const gitDiff = useAtomValue(gitDiffAtom);
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
  const scrolledPath = useRef<string | null>(null);

  // Scroll once per selection: the diffs re-render whenever the repository
  // changes, which must not drag the reader back to the selected file.
  useEffect(() => {
    if (selectedPath === null) {
      scrolledPath.current = null;
      return;
    }

    if (scrolledPath.current === selectedPath) {
      return;
    }

    const anchor = document.querySelector(
      `#${CSS.escape(fileDiffAnchorId(selectedPath))}`
    );

    if (anchor === null) {
      return;
    }

    scrolledPath.current = selectedPath;
    anchor.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [fileDiffs, selectedPath]);

  const toggleCollapsed = useCallback((path: string) => {
    setCollapsedPaths((paths) =>
      paths.has(path) ? withoutPath(paths, path) : new Set(paths).add(path)
    );
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

  return (
    <div>
      {fileDiffs.map((fileDiff) => (
        <FileDiffCard
          fileDiff={fileDiff}
          isCollapsed={collapsedPaths.has(fileDiff.name)}
          key={fileDiff.name}
          onToggle={toggleCollapsed}
        />
      ))}
    </div>
  );
}

export { ChangedFilesDiffs };
