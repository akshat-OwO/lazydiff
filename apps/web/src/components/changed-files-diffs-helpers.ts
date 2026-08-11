import type {
  CodeViewDiffItem,
  DiffLineAnnotation,
  FileDiffMetadata,
} from "@pierre/diffs";

import { fileDiffAnchorId } from "@/lib/file-diff-anchor";

type AnnotationMetadata =
  | {
      readonly annotationId: string;
      readonly kind: "saved";
    }
  | {
      readonly kind: "draft";
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
  readonly item: CodeViewDiffItem<AnnotationMetadata>;
  readonly version: number;
}

/**
 * Keyed by the parsed file diff, which is created once per sync, so item
 * identity survives re-renders while later batches stream in. CodeView compares
 * items by reference to take its append-only update path.
 */
const codeViewItems = new WeakMap<FileDiffMetadata, CachedCodeViewItem>();

const resolveCodeViewItem = (
  fileDiff: FileDiffMetadata,
  collapsed: boolean,
  annotations: DiffLineAnnotation<AnnotationMetadata>[] | undefined,
  version: number
): CodeViewDiffItem<AnnotationMetadata> => {
  const cached = codeViewItems.get(fileDiff);

  if (
    cached !== undefined &&
    cached.collapsed === collapsed &&
    cached.annotations === annotations &&
    cached.version === version
  ) {
    return cached.item;
  }

  const item: CodeViewDiffItem<AnnotationMetadata> = {
    collapsed,
    fileDiff,
    id: fileDiffAnchorId(fileDiff.name),
    type: "diff",
    version,
    ...(annotations === undefined ? {} : { annotations }),
  };

  codeViewItems.set(fileDiff, { annotations, collapsed, item, version });

  return item;
};

export {
  emptyFileDiffs,
  gutterUtilityCSS,
  resolveCodeViewItem,
  type AnnotationMetadata,
};
