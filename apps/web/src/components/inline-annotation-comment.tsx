import { TypesetMarkdown } from "@/components/typeset-markdown";
import { cn } from "@/lib/utils";

interface InlineAnnotationCommentProps {
  readonly className?: string;
  readonly comment: string;
  readonly number: number;
}

function InlineAnnotationComment({
  className,
  comment,
  number,
}: InlineAnnotationCommentProps) {
  return (
    <div
      className={cn("bg-secondary text-secondary-foreground my-1", className)}
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
