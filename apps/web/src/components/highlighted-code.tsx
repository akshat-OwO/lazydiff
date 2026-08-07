import { createHighlightedCodeBlockProps } from "@tanstack/highlight/react";
import { Fragment, useMemo } from "react";

import { annotationHighlighter } from "@/lib/code-highlighter";
import { cn } from "@/lib/utils";

interface HighlightedCodeProps {
  readonly className?: string;
  readonly code: string;
  readonly lang?: string;
}

function HighlightedCode({
  className,
  code,
  lang = "diff",
}: HighlightedCodeProps) {
  const highlighted = useMemo(() => {
    if (code.length === 0) {
      return null;
    }

    return createHighlightedCodeBlockProps({
      className: cn("th-code not-typeset", className),
      code,
      highlighter: annotationHighlighter,
      lang,
    });
  }, [className, code, lang]);

  if (highlighted === null) {
    return (
      <pre
        className={cn(
          "bg-muted/50 text-muted-foreground overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap",
          className
        )}
      >
        (no line text)
      </pre>
    );
  }

  return (
    <div className="annotation-code overflow-auto rounded-md text-xs">
      <pre className={highlighted.className} data-language={highlighted.lang}>
        <code>
          {highlighted.tokens.map((token, index) =>
            token.className === undefined ? (
              <Fragment key={index}>{token.value}</Fragment>
            ) : (
              <span className={`th-token th-${token.className}`} key={index}>
                {token.value}
              </span>
            )
          )}
        </code>
      </pre>
    </div>
  );
}

export { HighlightedCode };
