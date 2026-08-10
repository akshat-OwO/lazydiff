import { FileDiffIcon, FileWarningIcon } from "lucide-react";

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
import { useChangedFilesDiffs } from "@/components/use-changed-files-diffs";

function ChangedFilesDiffs() {
  const {
    fileDiffs,
    gitDiff,
    isHighlighterFailed,
    isHighlighterReady,
    isPathCollapsed,
    onDiffsScroll,
    retryHighlighterPreload,
    scrollportRef,
    toggleCollapsed,
  } = useChangedFilesDiffs();

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
