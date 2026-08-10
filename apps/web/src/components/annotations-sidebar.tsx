import {
  useAtom,
  useAtomRefresh,
  useAtomSet,
  useAtomValue,
} from "@effect/atom-react";
import { annotationRangeToGithubReviewComment } from "@lazydiff/protocol";
import {
  ClipboardCopyIcon,
  LinkIcon,
  MessageSquareTextIcon,
  SendHorizontalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { HighlightedCode } from "@/components/highlighted-code";
import { TypesetMarkdown } from "@/components/typeset-markdown";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  annotationFocusAtom,
  annotationsAtom,
  annotationsForScope,
  annotationsSidebarOpenAtom,
  formatAnnotationsMarkdown,
  markAnnotationsSent,
  removeAnnotation,
  sentAnnotationIdsAtom,
  unsentAnnotations,
} from "@/lib/annotations";
import type { DiffAnnotation } from "@/lib/annotations";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  gitChangeScopeAtom,
  githubPrAnnotationsPostMutation,
  githubPrReviewThreadsAtom,
  gitRepositoryAtom,
} from "@/lib/rpc";
import { cn } from "@/lib/utils";

function AnnotationCard({
  annotation,
  index,
  onDelete,
  onLink,
  sent,
}: {
  readonly annotation: DiffAnnotation;
  readonly index: number;
  readonly onDelete: (annotationId: string) => void;
  readonly onLink: (annotation: DiffAnnotation) => void;
  readonly sent: boolean;
}) {
  return (
    <article className="border-border space-y-3 border-b px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Annotation {index + 1}</h3>
          {sent ? (
            <p className="text-muted-foreground text-xs">Sent to remote</p>
          ) : null}
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            aria-label={`Go to annotation ${index + 1}`}
            onClick={() => onLink(annotation)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <LinkIcon />
          </Button>
          <Button
            aria-label={`Delete annotation ${index + 1}`}
            onClick={() => onDelete(annotation.id)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
      <div className="border-border space-y-2 border-t pt-3">
        <p className="text-muted-foreground font-mono text-xs">
          {annotation.filePath}
        </p>
        <HighlightedCode code={annotation.codeDiff} lang="diff" />
      </div>
      <div className="border-border border-t pt-3">
        <TypesetMarkdown>{annotation.comment}</TypesetMarkdown>
      </div>
    </article>
  );
}

type CopyState = "idle" | "copying" | "copied" | "failed";
type SendState = "idle" | "sending" | "sent" | "failed";

const copyButtonLabel = (copyState: CopyState, compact: boolean) => {
  if (copyState === "copying") {
    return "Copying…";
  }

  if (copyState === "copied") {
    return "Copied";
  }

  if (copyState === "failed") {
    return "Copy failed";
  }

  return compact ? "Copy" : "Copy annotations";
};

const sendButtonLabel = (sendState: SendState) => {
  if (sendState === "sending") {
    return "Sending…";
  }

  if (sendState === "sent") {
    return "Sent to PR";
  }

  if (sendState === "failed") {
    return "Send failed";
  }

  return "Send to remote";
};

const annotationsSummary = (
  savedCount: number,
  unsentCount: number
): string => {
  if (savedCount === 0) {
    return "No annotations yet";
  }

  if (unsentCount === 0) {
    return `${savedCount} saved · all sent`;
  }

  return `${unsentCount} unsent · ${savedCount} saved`;
};

function AnnotationsSidebar() {
  const scope = useAtomValue(gitChangeScopeAtom);
  const repository = useAtomValue(gitRepositoryAtom);
  const allAnnotations = useAtomValue(annotationsAtom);
  const sentAnnotationIds = useAtomValue(sentAnnotationIdsAtom);
  const setAnnotations = useAtomSet(annotationsAtom);
  const setSentAnnotationIds = useAtomSet(sentAnnotationIdsAtom);
  const setFocus = useAtomSet(annotationFocusAtom);
  const sendAnnotations = useAtomSet(githubPrAnnotationsPostMutation, {
    mode: "promise",
  });
  const refreshThreads = useAtomRefresh(githubPrReviewThreadsAtom);
  const annotations = annotationsForScope(allAnnotations, scope);
  const pendingAnnotations = useMemo(
    () => unsentAnnotations(annotations, sentAnnotationIds),
    [annotations, sentAnnotationIds]
  );
  const [open, setOpen] = useAtom(annotationsSidebarOpenAtom);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [sendState, setSendState] = useState<SendState>("idle");
  const [sendError, setSendError] = useState<string | undefined>();
  const isPullRequestReview =
    repository._tag === "Success" &&
    repository.value.data.source === "pull-request";

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

  const sendAnnotationsToRemote = () => {
    if (sendState === "sending" || pendingAnnotations.length === 0) {
      return;
    }

    const comments = pendingAnnotations.map((annotation) =>
      annotationRangeToGithubReviewComment({
        body: annotation.comment,
        filePath: annotation.filePath,
        range: annotation.range,
      })
    );
    const pendingIds = pendingAnnotations.map((annotation) => annotation.id);

    setSendError(undefined);
    setSendState("sending");

    void (async () => {
      try {
        await sendAnnotations({
          payload: {
            data: { comments },
            type: "github.pr.annotations.post",
          },
        });
        setSentAnnotationIds((current) =>
          markAnnotationsSent(current, pendingIds)
        );
        refreshThreads();
        setSendState("sent");
      } catch (error) {
        setSendState("failed");
        setSendError(
          error instanceof Error
            ? error.message
            : "Unable to send annotations to the pull request"
        );
      }

      window.setTimeout(() => setSendState("idle"), 2000);
    })();
  };

  const deleteAnnotation = (annotationId: string) => {
    setAnnotations((current) => removeAnnotation(current, annotationId));
    setSentAnnotationIds((current) => {
      if (!current.has(annotationId)) {
        return current;
      }

      const next = new Set(current);
      next.delete(annotationId);
      return next;
    });
  };

  const linkToAnnotation = (annotation: DiffAnnotation) => {
    setFocus({
      annotationId: annotation.id,
      filePath: annotation.filePath,
    });
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
            {annotationsSummary(annotations.length, pendingAnnotations.length)}
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
              onDelete={deleteAnnotation}
              onLink={linkToAnnotation}
              sent={sentAnnotationIds.has(annotation.id)}
            />
          ))
        )}
      </ScrollArea>

      <div className="border-sidebar-border space-y-2 border-t p-3">
        <div
          className={cn(
            "grid gap-2",
            isPullRequestReview ? "grid-cols-2" : "grid-cols-1"
          )}
        >
          <Button
            className="w-full"
            disabled={annotations.length === 0 || copyState === "copying"}
            onClick={copyAnnotations}
            type="button"
            variant="outline"
          >
            <ClipboardCopyIcon data-icon="inline-start" />
            {copyButtonLabel(copyState, isPullRequestReview)}
          </Button>
          {isPullRequestReview ? (
            <Button
              className="w-full"
              disabled={
                pendingAnnotations.length === 0 || sendState === "sending"
              }
              onClick={sendAnnotationsToRemote}
              type="button"
              variant="outline"
            >
              <SendHorizontalIcon data-icon="inline-start" />
              {sendButtonLabel(sendState)}
            </Button>
          ) : null}
        </div>
        {sendError === undefined ? null : (
          <p className="text-destructive text-xs" role="alert">
            {sendError}
          </p>
        )}
      </div>
    </aside>
  );
}

export { AnnotationsSidebar };
