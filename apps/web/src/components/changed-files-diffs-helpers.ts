import type { GitChangeScope, GithubPrReviewThread } from "@lazydiff/protocol";
import { githubSideToPierre } from "@lazydiff/protocol";
import type {
  CodeViewDiffItem,
  DiffLineAnnotation,
  FileDiffMetadata,
} from "@pierre/diffs";

import { annotationAnchorForRange } from "@/lib/annotation-snippet";
import {
  annotationMatchesFileDiff,
  draftMatchesFileDiff,
} from "@/lib/annotations";
import type { AnnotationDraft, DiffAnnotation } from "@/lib/annotations";
import { fileDiffAnchorId } from "@/lib/file-diff-anchor";

type AnnotationMetadata =
  | {
      readonly annotationId: string;
      readonly kind: "saved";
    }
  | {
      readonly kind: "draft";
    }
  | {
      readonly kind: "remote";
      readonly threadId: string;
    };

/**
 * Remote threads that can be projected onto a file in the live diff.
 */
const remoteThreadsForFilePath = (
  threads: readonly GithubPrReviewThread[],
  filePath: string
): readonly GithubPrReviewThread[] =>
  threads.filter(
    (thread) =>
      thread.path === filePath && thread.line !== null && !thread.isOutdated
  );

const remoteThreadLineAnnotation = (
  thread: GithubPrReviewThread
): DiffLineAnnotation<AnnotationMetadata> | undefined => {
  if (thread.line === null || thread.isOutdated) {
    return undefined;
  }

  return {
    lineNumber: thread.line,
    metadata: {
      kind: "remote",
      threadId: thread.id,
    },
    side: githubSideToPierre(thread.side),
  };
};

/**
 * Builds the CodeView line-annotation map used by the diffs pane, including
 * local saved/draft annotations and projected remote review threads.
 */
const collectDiffLineAnnotationsByFile = ({
  draft,
  fileDiffs,
  remoteThreads,
  scope,
  scopedAnnotations,
}: {
  readonly draft: AnnotationDraft | null;
  readonly fileDiffs: readonly FileDiffMetadata[];
  readonly remoteThreads: readonly GithubPrReviewThread[];
  readonly scope: GitChangeScope;
  readonly scopedAnnotations: readonly DiffAnnotation[];
}): Map<FileDiffMetadata, DiffLineAnnotation<AnnotationMetadata>[]> => {
  const map = new Map<
    FileDiffMetadata,
    DiffLineAnnotation<AnnotationMetadata>[]
  >();

  const append = (
    fileDiff: FileDiffMetadata,
    annotation: DiffLineAnnotation<AnnotationMetadata>
  ) => {
    const existing = map.get(fileDiff);

    if (existing === undefined) {
      map.set(fileDiff, [annotation]);
      return;
    }

    existing.push(annotation);
  };

  if (
    scopedAnnotations.length === 0 &&
    draft === null &&
    remoteThreads.length === 0
  ) {
    return map;
  }

  for (const fileDiff of fileDiffs) {
    for (const annotation of scopedAnnotations) {
      if (!annotationMatchesFileDiff(annotation, fileDiff)) {
        continue;
      }

      const anchor = annotationAnchorForRange(annotation.range);
      append(fileDiff, {
        lineNumber: anchor.lineNumber,
        metadata: { annotationId: annotation.id, kind: "saved" },
        side: anchor.side,
      });
    }

    for (const thread of remoteThreadsForFilePath(
      remoteThreads,
      fileDiff.name
    )) {
      const remoteAnnotation = remoteThreadLineAnnotation(thread);

      if (remoteAnnotation !== undefined) {
        append(fileDiff, remoteAnnotation);
      }
    }

    if (
      draft !== null &&
      draft.scope === scope &&
      draft.filePath === fileDiff.name &&
      draftMatchesFileDiff(draft, fileDiff)
    ) {
      append(fileDiff, {
        lineNumber: draft.lineNumber,
        metadata: { kind: "draft" },
        side: draft.side,
      });
    }
  }

  return map;
};

type AnnotationRenderTarget =
  | {
      readonly _tag: "draft";
      readonly draft: AnnotationDraft;
    }
  | {
      readonly _tag: "none";
    }
  | {
      readonly _tag: "remote";
      readonly thread: GithubPrReviewThread;
    }
  | {
      readonly _tag: "saved";
      readonly annotation: DiffAnnotation;
      readonly number: number;
    };

/**
 * Chooses what the CodeView annotation slot should render for one line
 * annotation. Kept pure so regressions that drop the remote branch fail tests.
 */
const resolveAnnotationRenderTarget = (
  metadata: AnnotationMetadata,
  {
    annotationsById,
    draft,
    remoteThreadsById,
  }: {
    readonly annotationsById: ReadonlyMap<
      string,
      { annotation: DiffAnnotation; number: number }
    >;
    readonly draft: AnnotationDraft | null;
    readonly remoteThreadsById: ReadonlyMap<string, GithubPrReviewThread>;
  }
): AnnotationRenderTarget => {
  if (metadata.kind === "draft") {
    return draft === null ? { _tag: "none" } : { _tag: "draft", draft };
  }

  if (metadata.kind === "remote") {
    const thread = remoteThreadsById.get(metadata.threadId);
    return thread === undefined ? { _tag: "none" } : { _tag: "remote", thread };
  }

  const saved = annotationsById.get(metadata.annotationId);
  return saved === undefined
    ? { _tag: "none" }
    : {
        _tag: "saved",
        annotation: saved.annotation,
        number: saved.number,
      };
};

const emptyFileDiffs: readonly FileDiffMetadata[] = [];

const gutterUtilityCSS = `
[data-column-number] {
  padding-left: calc(1lh + 1ch);
}

[data-gutter-utility-slot] {
  left: 4px;
  right: auto;
  justify-content: flex-start;
}

[data-utility-button] {
  margin-right: 0;
}
`;

interface CachedCodeViewItem {
  readonly annotations: DiffLineAnnotation<AnnotationMetadata>[] | undefined;
  readonly collapsed: boolean;
  /** Caller-supplied collapse counter from the diffs hook. */
  readonly collapseVersion: number;
  readonly item: CodeViewDiffItem<AnnotationMetadata>;
  /**
   * Version published to CodeView. Pierre only applies controlled item updates
   * when this advances, including annotation attachment changes.
   */
  readonly publishedVersion: number;
}

/**
 * Keyed by the parsed file diff, which is created once per sync, so item
 * identity survives re-renders while later batches stream in. CodeView compares
 * items by reference to take its append-only update path.
 */
const codeViewItems = new WeakMap<FileDiffMetadata, CachedCodeViewItem>();

/**
 * Builds a stable CodeView item for a file diff. Annotation and collapse
 * changes bump `publishedVersion` so CodeView's controlled reconcile path
 * picks up draft/saved/remote line annotations (same-version updates are
 * ignored by Pierre).
 */
const resolveCodeViewItem = (
  fileDiff: FileDiffMetadata,
  collapsed: boolean,
  annotations: DiffLineAnnotation<AnnotationMetadata>[] | undefined,
  collapseVersion: number
): CodeViewDiffItem<AnnotationMetadata> => {
  const cached = codeViewItems.get(fileDiff);

  if (
    cached !== undefined &&
    cached.collapsed === collapsed &&
    cached.annotations === annotations &&
    cached.collapseVersion === collapseVersion
  ) {
    return cached.item;
  }

  const publishedVersion =
    cached === undefined ? collapseVersion : cached.publishedVersion + 1;

  const item: CodeViewDiffItem<AnnotationMetadata> = {
    collapsed,
    fileDiff,
    id: fileDiffAnchorId(fileDiff.name),
    type: "diff",
    version: publishedVersion,
    ...(annotations === undefined ? {} : { annotations }),
  };

  codeViewItems.set(fileDiff, {
    annotations,
    collapseVersion,
    collapsed,
    item,
    publishedVersion,
  });

  return item;
};

export {
  collectDiffLineAnnotationsByFile,
  emptyFileDiffs,
  gutterUtilityCSS,
  remoteThreadLineAnnotation,
  remoteThreadsForFilePath,
  resolveAnnotationRenderTarget,
  resolveCodeViewItem,
  type AnnotationMetadata,
};
