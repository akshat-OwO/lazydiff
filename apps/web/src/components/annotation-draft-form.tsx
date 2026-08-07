import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  annotationDraftAtom,
  annotationsAtom,
  annotationsForScope,
  annotationsSidebarOpenAtom,
  createAnnotationId,
} from "@/lib/annotations";
import type { AnnotationDraft } from "@/lib/annotations";
import { gitChangeScopeAtom } from "@/lib/rpc";

interface AnnotationDraftFormProps {
  readonly draft: AnnotationDraft;
}

function AnnotationDraftForm({ draft }: AnnotationDraftFormProps) {
  const scope = useAtomValue(gitChangeScopeAtom);
  const annotations = useAtomValue(annotationsAtom);
  const setDraft = useAtomSet(annotationDraftAtom);
  const setAnnotations = useAtomSet(annotationsAtom);
  const setSidebarOpen = useAtomSet(annotationsSidebarOpenAtom);
  const [comment, setComment] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formId = useId();
  const scopedCount = annotationsForScope(annotations, scope).length;

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const cancelDraft = () => {
    setDraft(null);
  };

  const saveAnnotation = () => {
    const trimmed = comment.trim();

    if (trimmed.length === 0) {
      return;
    }

    const isFirstAnnotation = scopedCount === 0;

    setAnnotations((current) => [
      ...current,
      {
        codeDiff: draft.codeDiff,
        comment: trimmed,
        filePath: draft.filePath,
        id: createAnnotationId(),
        range: draft.range,
        scope: draft.scope,
      },
    ]);
    setDraft(null);

    if (isFirstAnnotation) {
      setSidebarOpen(true);
    }
  };

  return (
    <form
      aria-label="New annotation"
      className="bg-background border-border my-1 space-y-2 border p-3"
      id={formId}
      onSubmit={(event) => {
        event.preventDefault();
        saveAnnotation();
      }}
    >
      <Textarea
        aria-label="Annotation comment"
        onChange={(event) => setComment(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            cancelDraft();
            return;
          }

          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            saveAnnotation();
          }
        }}
        placeholder="Write an annotation…"
        ref={textareaRef}
        rows={3}
        value={comment}
      />
      <div className="flex items-center justify-end gap-2">
        <Button onClick={cancelDraft} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
        <Button disabled={comment.trim().length === 0} size="sm" type="submit">
          Save annotation
        </Button>
      </div>
    </form>
  );
}

export { AnnotationDraftForm };
