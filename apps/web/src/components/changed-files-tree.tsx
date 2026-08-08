import type { GitStatusEntry } from "@lazydiff/protocol";
import {
  FileTree,
  useFileTree,
  useFileTreeSearch,
  useFileTreeSelection,
} from "@pierre/trees/react";
import { useNavigate } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { useEffect, useMemo } from "react";

import { Input } from "@/components/ui/input";
import { toLocationHash } from "@/lib/file-diff-anchor";
import { cn } from "@/lib/utils";

interface ChangedFilesTreeProps {
  readonly activePath: string | null;
  readonly className?: string;
  readonly entries: readonly GitStatusEntry[];
  readonly label: string;
}

function ChangedFilesTree({
  activePath,
  className,
  entries,
  label,
}: ChangedFilesTreeProps) {
  const navigate = useNavigate();
  const paths = useMemo(() => entries.map(({ path }) => path), [entries]);
  const { model } = useFileTree({
    density: "compact",
    dragAndDrop: false,
    fileTreeSearchMode: "hide-non-matches",
    flattenEmptyDirectories: true,
    gitStatus: entries,
    icons: "standard",
    initialExpansion: "open",
    initialSelectedPaths: activePath === null ? [] : [activePath],
    paths,
    renaming: false,
    search: false,
  });
  const search = useFileTreeSearch(model);
  const selectedPaths = useFileTreeSelection(model);
  const selectedPath =
    selectedPaths.length === 1 ? selectedPaths[0] : undefined;

  useEffect(() => {
    model.resetPaths(paths);
    model.setGitStatus(entries);
  }, [entries, model, paths]);

  // Mirror the selected file into the tree, including selections made by the
  // browser history, diff list, or scrollspy hash updates.
  useEffect(() => {
    for (const path of model.getSelectedPaths()) {
      if (path !== activePath) {
        model.getItem(path)?.deselect();
      }
    }

    if (activePath !== null) {
      model.getItem(activePath)?.select();
    }
  }, [activePath, model]);

  // Directories only expand and collapse; the hash always names a file diff.
  useEffect(() => {
    if (
      selectedPath === undefined ||
      selectedPath === activePath ||
      model.getItem(selectedPath)?.isDirectory() !== false
    ) {
      return;
    }

    navigate({ hash: toLocationHash(selectedPath), to: "/" });
  }, [activePath, model, navigate, selectedPath]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}>
      <div className="relative shrink-0">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          aria-label={`Search ${label.toLowerCase()}`}
          className="bg-background h-8 w-full pl-8 shadow-none"
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
          aria-label={label}
          className="changed-files-tree"
          model={model}
        />
      )}
    </div>
  );
}

export { ChangedFilesTree };
