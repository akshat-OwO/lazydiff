export interface FileDiffSectionContentOffset {
  readonly path: string;
  /**
   * Section top within the scrollport's scrollable content
   * (`elementTop - scrollportTop + scrollTop`).
   */
  readonly contentTop: number;
}

/**
 * Choose the file that should appear selected while the reader scrolls.
 *
 * The active file is the last section whose content top has crossed the
 * activation line (`scrollTop + activationOffset`). At the bottom of the
 * scrollport, the last section wins even if its top never reaches that line.
 *
 * Callers should pass cached content tops so scroll frames stay O(log n) in
 * section count and avoid measuring the DOM on every animation frame.
 */
export function findInViewFilePath(
  sections: readonly FileDiffSectionContentOffset[],
  options: {
    readonly activationOffset: number;
    readonly isScrolledToBottom: boolean;
    readonly scrollTop: number;
  }
): string | null {
  if (sections.length === 0) {
    return null;
  }

  if (options.isScrolledToBottom) {
    return sections.at(-1)?.path ?? null;
  }

  const activationLine = options.scrollTop + options.activationOffset;
  let low = 0;
  let high = sections.length - 1;
  let activeIndex = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const section = sections[mid];

    if (section === undefined) {
      break;
    }

    if (section.contentTop <= activationLine) {
      activeIndex = mid;
      low = mid + 1;
      continue;
    }

    high = mid - 1;
  }

  return sections[activeIndex]?.path ?? null;
}
