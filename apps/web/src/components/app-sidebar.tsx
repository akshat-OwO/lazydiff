import { useAtomValue } from "@effect/atom-react";
import type { GitStatusEntry } from "@lazydiff/protocol";
import { FileTree, useFileTree, useFileTreeSearch } from "@pierre/trees/react";
import { SearchIcon } from "lucide-react";
import { useEffect, useMemo } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInput,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { gitStatusAtom } from "@/lib/rpc";

interface ChangedFilesTreeProps {
  readonly entries: readonly GitStatusEntry[];
}

function ChangedFilesTree({ entries }: ChangedFilesTreeProps) {
  const paths = useMemo(() => entries.map(({ path }) => path), [entries]);
  const { model } = useFileTree({
    density: "compact",
    dragAndDrop: false,
    fileTreeSearchMode: "hide-non-matches",
    flattenEmptyDirectories: true,
    gitStatus: entries,
    icons: "standard",
    initialExpansion: "open",
    paths,
    renaming: false,
    search: false,
  });
  const search = useFileTreeSearch(model);

  useEffect(() => {
    model.resetPaths(paths);
    model.setGitStatus(entries);
  }, [entries, model, paths]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="relative shrink-0">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <SidebarInput
          aria-label="Search changed files"
          className="pl-8"
          onChange={(event) => search.setValue(event.currentTarget.value)}
          placeholder="Search files"
          type="search"
          value={search.value}
        />
      </div>
      {search.value.length > 0 && search.matchingPaths.length === 0 ? (
        <p className="text-muted-foreground p-3 text-sm">No matching files</p>
      ) : (
        <FileTree
          aria-label="Changed files"
          className="changed-files-tree"
          model={model}
        />
      )}
    </div>
  );
}

function AppSidebar() {
  const gitStatus = useAtomValue(gitStatusAtom);

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
            <ChangedFilesTree entries={gitStatus.value.data.entries} />
          ))}
      </SidebarContent>
    </Sidebar>
  );
}

export { AppSidebar };
