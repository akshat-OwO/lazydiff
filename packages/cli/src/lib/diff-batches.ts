/** Number of changed files loaded in the first (and each subsequent) diff batch. */
export const diffBatchSize = 20;

export interface DiffBatch {
  readonly complete: boolean;
  readonly patch: string;
  readonly reset: boolean;
}

export const chunkItems = <A>(
  items: readonly A[],
  size: number
): readonly (readonly A[])[] => {
  if (items.length === 0 || size <= 0) {
    return [];
  }

  const batches: A[][] = [];

  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }

  return batches;
};

export const joinPatchFragments = (patches: readonly string[]) =>
  patches
    .filter((patch) => patch.length > 0)
    .map((patch) => (patch.endsWith("\n") ? patch : `${patch}\n`))
    .join("");

/**
 * Splits a multi-file unified patch into one fragment per `diff --git` file.
 */
export const splitUnifiedPatch = (patch: string): readonly string[] => {
  if (patch.length === 0) {
    return [];
  }

  return patch.split(/(?=^diff --git )/mu).filter((part) => part.length > 0);
};

export const toDiffBatches = (
  patches: readonly string[],
  batchSize = diffBatchSize
): readonly DiffBatch[] => {
  if (patches.length === 0) {
    return [{ complete: true, patch: "", reset: true }];
  }

  const chunks = chunkItems(patches, batchSize);

  return chunks.map((chunk, index) => ({
    complete: index === chunks.length - 1,
    patch: joinPatchFragments(chunk),
    reset: index === 0,
  }));
};
