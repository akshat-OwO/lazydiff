import { TypesetMarkdown } from "@/components/typeset-markdown";
import { cn } from "@/lib/utils";

interface InlineAnnotationCommentProps {
  readonly className?: string;
  readonly comment: string;
}

function InlineAnnotationComment({
  className,
  comment,
}: InlineAnnotationCommentProps) {
  return (
    <div
      className={cn(
        "bg-background border-border my-1 border px-3 py-2",
        className
      )}
    >
      <TypesetMarkdown>{comment}</TypesetMarkdown>
    </div>
  );
}

export { InlineAnnotationComment };
