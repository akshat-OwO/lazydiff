import { useAtomValue } from "@effect/atom-react";
import type { GitStatusEntry } from "@lazydiff/protocol";
import { PatchDiff } from "@pierre/diffs/react";
import { FileWarningIcon } from "lucide-react";
import { useMemo } from "react";

import { useTheme } from "@/components/theme-provider";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { gitFileDiffAtom } from "@/lib/rpc";

interface FileDiffViewProps {
  readonly entry: GitStatusEntry;
}

function FileDiffView({ entry }: FileDiffViewProps) {
  const { theme } = useTheme();
  const fileDiff = useAtomValue(gitFileDiffAtom(entry.path));
  const options = useMemo(
    () =>
      ({
        diffStyle: "unified",
        overflow: "wrap",
        themeType: theme,
      }) as const,
    [theme]
  );

  if (fileDiff._tag === "Initial") {
    return (
      <div aria-label={`Loading diff for ${entry.path}`} className="space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (fileDiff._tag === "Failure") {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileWarningIcon />
          </EmptyMedia>
          <EmptyTitle>Diff unavailable</EmptyTitle>
          <EmptyDescription>
            The diff for {entry.path} could not be read.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const { patch } = fileDiff.value.data.diff;

  if (patch.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileWarningIcon />
          </EmptyMedia>
          <EmptyTitle>No textual changes</EmptyTitle>
          <EmptyDescription>
            {entry.path} has no line changes to display.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return <PatchDiff className="file-diff" options={options} patch={patch} />;
}

export { FileDiffView };
