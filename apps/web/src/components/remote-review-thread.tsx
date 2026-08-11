import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import type { GithubPrReviewThread } from "@lazydiff/protocol";
import { ChevronRightIcon } from "lucide-react";
import { useId, useState } from "react";

import { TypesetMarkdown } from "@/components/typeset-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  githubPrReviewCommentsReplyMutation,
  githubPrReviewThreadsAtom,
  githubPrReviewThreadsResolveMutation,
} from "@/lib/rpc";
import { cn } from "@/lib/utils";

interface RemoteReviewThreadProps {
  readonly className?: string;
  readonly thread: GithubPrReviewThread;
}

function RemoteReviewThread({ className, thread }: RemoteReviewThreadProps) {
  const replyToComment = useAtomSet(githubPrReviewCommentsReplyMutation, {
    mode: "promise",
  });
  const resolveThread = useAtomSet(githubPrReviewThreadsResolveMutation, {
    mode: "promise",
  });
  const refreshThreads = useAtomRefresh(githubPrReviewThreadsAtom);
  const threadsResult = useAtomValue(githubPrReviewThreadsAtom);
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  // Undefined means follow the live resolved state; a boolean is a user override.
  const [expandedOverride, setExpandedOverride] = useState<
    boolean | undefined
  >();
  const formId = useId();
  const [parentComment] = thread.comments;

  if (parentComment === undefined) {
    return null;
  }

  const liveThread =
    threadsResult._tag === "Success"
      ? (threadsResult.value.data.threads.find(
          (candidate) => candidate.id === thread.id
        ) ?? thread)
      : thread;
  const expanded = expandedOverride ?? !liveThread.isResolved;

  const runAction = async (action: () => Promise<void>): Promise<boolean> => {
    if (pending) {
      return false;
    }

    setError(undefined);
    setPending(true);

    try {
      await action();
      refreshThreads();
      return true;
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update the review thread"
      );
      return false;
    } finally {
      setPending(false);
    }
  };

  const replyCount = liveThread.comments.length - 1;
  const collapsedSummary =
    replyCount > 0
      ? `${parentComment.authorLogin} · Resolved · ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`
      : `${parentComment.authorLogin} · Resolved`;

  return (
    <div
      className={cn(
        "bg-secondary text-secondary-foreground my-1 scroll-mt-0",
        liveThread.isResolved && "opacity-70",
        className
      )}
    >
      <header className="border-border flex items-center justify-between gap-2 border-b px-3 py-2">
        <button
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          onClick={() =>
            setExpandedOverride(
              (current) => !(current ?? !liveThread.isResolved)
            )
          }
          type="button"
        >
          <ChevronRightIcon
            className={cn(
              "text-muted-foreground size-3.5 shrink-0 transition-transform",
              expanded && "rotate-90"
            )}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {liveThread.isResolved && !expanded
                ? collapsedSummary
                : [
                    parentComment.authorLogin,
                    liveThread.isResolved ? "Resolved" : undefined,
                    liveThread.isOutdated ? "Outdated" : undefined,
                  ]
                    .filter((part) => part !== undefined)
                    .join(" · ")}
            </p>
            {expanded ? (
              <p className="text-muted-foreground text-xs">
                {new Date(parentComment.createdAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        </button>
        <Button
          disabled={pending}
          onClick={() =>
            void runAction(async () => {
              await resolveThread({
                payload: {
                  data: {
                    resolved: !liveThread.isResolved,
                    threadId: liveThread.id,
                  },
                  type: "github.pr.review-threads.resolve",
                },
              });
            })
          }
          size="xs"
          type="button"
          variant="outline"
        >
          {liveThread.isResolved ? "Unresolve" : "Resolve"}
        </Button>
      </header>

      {expanded ? (
        <div className="space-y-3 px-3 py-2">
          {liveThread.comments.map((comment) => (
            <div className="space-y-1" key={comment.id}>
              {comment.id === parentComment.id ? null : (
                <p className="text-muted-foreground text-xs font-medium">
                  {comment.authorLogin}
                </p>
              )}
              <TypesetMarkdown>{comment.body}</TypesetMarkdown>
            </div>
          ))}

          <form
            className="space-y-2"
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = reply.trim();

              if (trimmed.length === 0) {
                return;
              }

              void (async () => {
                const ok = await runAction(async () => {
                  await replyToComment({
                    payload: {
                      data: {
                        body: trimmed,
                        commentId: parentComment.databaseId,
                      },
                      type: "github.pr.review-comments.reply",
                    },
                  });
                });

                if (ok) {
                  setReply("");
                }
              })();
            }}
          >
            <Textarea
              aria-label="Reply to review comment"
              disabled={pending}
              onChange={(event) => setReply(event.target.value)}
              placeholder="Reply…"
              rows={2}
              value={reply}
            />
            <div className="flex items-center justify-end gap-2">
              <Button
                disabled={pending || reply.trim().length === 0}
                size="sm"
                type="submit"
              >
                Reply
              </Button>
            </div>
          </form>

          {error === undefined ? null : (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export { RemoteReviewThread };
