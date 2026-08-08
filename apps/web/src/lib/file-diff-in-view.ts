export interface FileDiffSectionOffset {
  readonly path: string;
  /**
   * Section top relative to the scrollport top
   * (`elementTop - scrollportTop`).
   */
  readonly top: number;
}

/**
 * Choose the file that should appear selected while the reader scrolls.
 *
 * The active file is the last section whose top has crossed the activation
 * line (typically the top of the scrollport). At the bottom of the scrollport,
 * the last section wins even if its top never reaches that line.
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
