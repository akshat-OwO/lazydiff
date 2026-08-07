import { Markdown } from "@tanstack/markdown/react";

import { cn } from "@/lib/utils";

interface TypesetMarkdownProps {
  readonly children: string;
  readonly className?: string;
}

function TypesetMarkdown({ children, className }: TypesetMarkdownProps) {
  return (
    <div className={cn("typeset typeset-annotation", className)}>
      <Markdown>{children}</Markdown>
    </div>
  );
}

export { TypesetMarkdown };
