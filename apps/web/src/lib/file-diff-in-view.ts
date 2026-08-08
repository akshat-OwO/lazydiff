/**
 * Sticky navbar + file headers use Tailwind `*-14` (3.5rem). The scrollspy
 * activation line sits just under that chrome.
 */
export const FILE_DIFF_STICKY_OFFSET_REM = 3.5;

export interface FileDiffSectionOffset {
  readonly path: string;
  /** `getBoundingClientRect().top` for the file section. */
  readonly top: number;
}

/**
 * Choose the file that should appear selected while the reader scrolls.
 *
 * The active file is the last section whose top has crossed the activation
 * line. At the bottom of the page, the last section wins even if its top never
 * reaches that line.
 */
export function findInViewFilePath(
  sections: readonly FileDiffSectionOffset[],
  options: {
    readonly activationOffset: number;
    readonly isScrolledToBottom: boolean;
  }
): string | null {
  if (sections.length === 0) {
    return null;
  }

  if (options.isScrolledToBottom) {
    return sections.at(-1)?.path ?? null;
  }

  let activePath = sections[0]?.path ?? null;

  for (const section of sections) {
    if (section.top <= options.activationOffset) {
      activePath = section.path;
      continue;
    }

    break;
  }

  return activePath;
}
