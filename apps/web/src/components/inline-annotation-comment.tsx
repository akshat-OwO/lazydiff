import { TypesetMarkdown } from "@/components/typeset-markdown";
import { annotationInlineAnchorId } from "@/lib/file-diff-anchor";
import { cn } from "@/lib/utils";

interface InlineAnnotationCommentProps {
  readonly annotationId: string;
  readonly className?: string;
  readonly comment: string;
  readonly number: number;
}

function InlineAnnotationComment({
  annotationId,
  className,
  comment,
  number,
}: InlineAnnotationCommentProps) {
  return (
    <div
      className={cn(
        "bg-secondary text-secondary-foreground my-1 scroll-mt-0",
        className
      )}
      id={annotationInlineAnchorId(annotationId)}
    >
      <header className="border-border border-b px-3 py-2">
        <p className="text-sm font-semibold">Annotation {number}</p>
      </header>
      <div className="px-3 py-2">
        <TypesetMarkdown>{comment}</TypesetMarkdown>
      </div>
    </div>
  );
}

export { InlineAnnotationComment };
