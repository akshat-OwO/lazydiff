import { useAtomValue } from "@effect/atom-react";
import type { FileDiffMetadata } from "@pierre/diffs";
import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";

import { ChangedFilesTree } from "@/components/changed-files-tree";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { fromLocationHash } from "@/lib/file-diff-anchor";
import { sumChangedLines } from "@/lib/file-diff-summary";
import { gitDiffAtom, gitStatusAtom } from "@/lib/rpc";

const emptyFileDiffs: readonly FileDiffMetadata[] = [];

function AppSidebar() {
  const gitStatus = useAtomValue(gitStatusAtom);
  const gitDiff = useAtomValue(gitDiffAtom);
  const activePath = useLocation({
    select: (location) => fromLocationHash(location.hash),
  });
  const fileDiffs =
    gitDiff._tag === "Success" ? gitDiff.value.fileDiffs : emptyFileDiffs;
  const diffComplete =
    gitDiff._tag === "Success" ? gitDiff.value.complete : true;
  const { additions, deletions } = useMemo(
    () => sumChangedLines(fileDiffs),
    [fileDiffs]
  );

  return (
    <Sidebar
      className="top-14 bottom-auto h-[calc(100svh-3.5rem)]"
      collapsible="offcanvas"
    >
      <SidebarHeader className="h-14 justify-center border-b px-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Changed files</p>
            {gitStatus._tag === "Success" && (
              <p className="text-muted-foreground text-xs">
                {gitStatus.value.data.entries.length} files
              </p>
            )}
          </div>
          {gitDiff._tag === "Success" &&
            (additions > 0 || deletions > 0 || !diffComplete) && (
              <div className="flex shrink-0 items-center gap-1 font-mono text-xs">
                {deletions > 0 && (
                  <span className="bg-destructive/15 text-destructive rounded-md px-1.5 py-0.5">
                    -{deletions}
                  </span>
                )}
                {additions > 0 && (
                  <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">
                    +{additions}
                  </span>
                )}
                {!diffComplete && (
                  <span className="text-muted-foreground rounded-md px-1.5 py-0.5">
                    …
                  </span>
                )}
              </div>
            )}
        </div>
      </SidebarHeader>
      <SidebarContent className="p-2">
        {gitStatus._tag === "Initial" && (
          <div aria-label="Loading changed files" className="space-y-2 p-2">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        )}
        {gitStatus._tag === "Failure" && (
          <div className="text-muted-foreground p-3 text-sm">
            <p>Changed files are unavailable.</p>
          </div>
        )}
        {gitStatus._tag === "Success" &&
          (gitStatus.value.data.entries.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">
              No changed files
            </p>
          ) : (
            <ChangedFilesTree
              activePath={activePath}
              entries={gitStatus.value.data.entries}
              label="Changed files"
            />
          ))}
      </SidebarContent>
    </Sidebar>
  );
}

export { AppSidebar };
