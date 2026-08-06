import { useAtomValue } from "@effect/atom-react";
import type { GitStatusEntry } from "@lazydiff/protocol";
import { createFileRoute } from "@tanstack/react-router";
import { FileQuestionIcon, FolderOpenIcon } from "lucide-react";
import { useMemo } from "react";

import { ChangedFilesTree } from "@/components/changed-files-tree";
import { FileDiffView } from "@/components/file-diff-view";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { normalizeChangedPath, resolveChangedPath } from "@/lib/changed-paths";
import { gitStatusAtom } from "@/lib/rpc";

export const Route = createFileRoute("/$")({
  component: ChangedPathRoute,
});

const noEntries: readonly GitStatusEntry[] = [];

function ChangedPathRoute() {
  const { _splat } = Route.useParams();
  const path = normalizeChangedPath(_splat);
  const gitStatus = useAtomValue(gitStatusAtom);
  // The resolved path feeds a file tree that reuses its model across renders,
  // so it has to keep a stable identity while the changes stay the same.
  const changedPath = useMemo(
    () =>
      resolveChangedPath(
        gitStatus._tag === "Success" ? gitStatus.value.data.entries : noEntries,
        path
      ),
    [gitStatus, path]
  );

  if (gitStatus._tag === "Initial") {
    return (
      <div aria-label="Loading changes" className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (gitStatus._tag === "Failure") {
    return (
      <Empty className="min-h-[60svh] border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestionIcon />
          </EmptyMedia>
          <EmptyTitle>Changes unavailable</EmptyTitle>
          <EmptyDescription>
            The Git changes could not be read.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (changedPath._tag === "File") {
    return <FileDiffView entry={changedPath.entry} />;
  }

  if (changedPath._tag === "Directory") {
    // The tree virtualizes its rows, so it needs a definite height.
    return (
      <section className="flex h-[calc(100svh-6.5rem)] flex-col gap-3">
        <header className="flex items-center gap-2">
          <FolderOpenIcon className="text-muted-foreground size-4" />
          <h1 className="text-sm font-semibold">{changedPath.path}</h1>
          <span className="text-muted-foreground text-xs">
            {changedPath.entries.length} files
          </span>
        </header>
        <ChangedFilesTree
          activePath={null}
          entries={changedPath.entries}
          label={`Changed files in ${changedPath.path}`}
        />
      </section>
    );
  }

  return (
    <Empty className="min-h-[60svh] border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileQuestionIcon />
        </EmptyMedia>
        <EmptyTitle>Not part of the current changes</EmptyTitle>
        <EmptyDescription>
          {path.length > 0
            ? `${path} has no changes in the selected scope.`
            : "Pick a changed file to review its diff."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
