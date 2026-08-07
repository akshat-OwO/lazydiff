import type { FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { ChevronRightIcon } from "lucide-react";
import { useMemo } from "react";

import { useTheme } from "@/components/theme-provider";
import { fileDiffAnchorId } from "@/lib/file-diff-anchor";
import {
  countChangedLines,
  describeChangeWithoutHunks,
  describeModeChange,
} from "@/lib/file-diff-summary";
import { cn } from "@/lib/utils";

interface FileDiffCardProps {
  readonly fileDiff: FileDiffMetadata;
  readonly isCollapsed: boolean;
  readonly onToggle: (path: string) => void;
}

function FileDiffCard({ fileDiff, isCollapsed, onToggle }: FileDiffCardProps) {
  const { theme } = useTheme();
  const { additions, deletions } = useMemo(
    () => countChangedLines(fileDiff),
    [fileDiff]
  );
  const modeChange = useMemo(() => describeModeChange(fileDiff), [fileDiff]);
  const changeWithoutHunks = useMemo(
    () => describeChangeWithoutHunks(fileDiff),
    [fileDiff]
  );
  const options = useMemo(
    () => ({
      collapsed: isCollapsed,
      diffStyle: "unified" as const,
      disableFileHeader: true,
      overflow: "wrap" as const,
      themeType: theme,
    }),
    [isCollapsed, theme]
  );

  return (
    <section
      className="scroll-mt-14 border-b"
      id={fileDiffAnchorId(fileDiff.name)}
    >
      <button
        aria-expanded={!isCollapsed}
        className="bg-muted/40 hover:bg-muted sticky top-14 z-10 flex w-full items-center gap-2 border-b px-4 py-2 text-left"
        onClick={() => onToggle(fileDiff.name)}
        type="button"
      >
        <ChevronRightIcon
          className={cn(
            "text-muted-foreground size-4 shrink-0 transition-transform",
            !isCollapsed && "rotate-90"
          )}
        />
        <span className="truncate font-mono text-xs">
          {fileDiff.prevName === undefined
            ? fileDiff.name
            : `${fileDiff.prevName} → ${fileDiff.name}`}
        </span>
        {modeChange !== null && (
          <span className="text-muted-foreground shrink-0 font-mono text-xs">
            {modeChange}
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono text-xs">
          <span className="text-destructive">-{deletions}</span>{" "}
          <span className="text-emerald-600 dark:text-emerald-400">
            +{additions}
          </span>
        </span>
      </button>
      {changeWithoutHunks === null ? (
        <FileDiff fileDiff={fileDiff} options={options} />
      ) : (
        !isCollapsed && (
          <p className="text-muted-foreground px-4 py-3 text-sm">
            {changeWithoutHunks}
          </p>
        )
      )}
    </section>
  );
}

export { FileDiffCard };
