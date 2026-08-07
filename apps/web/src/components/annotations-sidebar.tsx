import { useAtom, useAtomValue } from "@effect/atom-react";
import { ClipboardCopyIcon, MessageSquareTextIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  annotationsAtom,
  annotationsSidebarOpenAtom,
  formatAnnotationsMarkdown,
} from "@/lib/annotations";
import type { DiffAnnotation } from "@/lib/annotations";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

function AnnotationCard({
  annotation,
  index,
}: {
  readonly annotation: DiffAnnotation;
  readonly index: number;
}) {
  return (
    <article className="border-border space-y-3 border-b px-4 py-4">
      <h3 className="text-sm font-semibold">Annotation {index + 1}</h3>
      <div className="border-border space-y-2 border-t pt-3">
        <p className="text-muted-foreground font-mono text-xs">
          {annotation.filePath}
        </p>
        <pre className="bg-muted/50 max-h-40 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap">
          {annotation.codeDiff.length === 0
            ? "(no line text)"
            : annotation.codeDiff}
        </pre>
      </div>
      <div className="border-border border-t pt-3">
        <p className="text-sm whitespace-pre-wrap">{annotation.comment}</p>
      </div>
    </article>
  );
}

type CopyState = "idle" | "copying" | "copied" | "failed";

function copyButtonLabel(copyState: CopyState) {
  if (copyState === "copying") {
    return "Copying…";
  }

  if (copyState === "copied") {
    return "Copied";
  }

  if (copyState === "failed") {
    return "Copy failed";
  }

  return "Copy annotations";
}

function AnnotationsSidebar() {
  const annotations = useAtomValue(annotationsAtom);
  const [open, setOpen] = useAtom(annotationsSidebarOpenAtom);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  if (!open) {
    return null;
  }

  const copyAnnotations = () => {
    if (copyState === "copying") {
      return;
    }

    const markdown = formatAnnotationsMarkdown(annotations);
    setCopyState("copying");

    void (async () => {
      try {
        await copyTextToClipboard(markdown);
        setCopyState("copied");
      } catch {
        setCopyState("failed");
      }

      window.setTimeout(() => setCopyState("idle"), 2000);
    })();
  };

  return (
    <aside
      aria-label="Annotations"
      className={cn(
        "bg-sidebar text-sidebar-foreground border-sidebar-border sticky top-14 z-20 flex h-[calc(100svh-3.5rem)] w-80 shrink-0 flex-col border-l"
      )}
    >
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div>
          <p className="text-sm font-semibold">Annotations</p>
          <p className="text-muted-foreground text-xs">
            {annotations.length === 0
              ? "No annotations yet"
              : `${annotations.length} saved`}
          </p>
        </div>
        <Button
          aria-label="Close annotations"
          onClick={() => setOpen(false)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {annotations.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 px-6 py-10 text-center text-sm">
            <MessageSquareTextIcon className="size-5" />
            <p>
              Hover the left gutter on a diff line, click +, and write a
              comment.
            </p>
          </div>
        ) : (
          annotations.map((annotation, index) => (
            <AnnotationCard
              annotation={annotation}
              index={index}
              key={annotation.id}
            />
          ))
        )}
      </ScrollArea>

      <div className="border-sidebar-border border-t p-3">
        <Button
          className="w-full"
          disabled={annotations.length === 0 || copyState === "copying"}
          onClick={copyAnnotations}
          type="button"
          variant="outline"
        >
          <ClipboardCopyIcon data-icon="inline-start" />
          {copyButtonLabel(copyState)}
        </Button>
      </div>
    </aside>
  );
}

export { AnnotationsSidebar };
