import {
  DEFAULT_THEMES,
  getFiletypeFromFileName,
  preloadHighlighter,
} from "@pierre/diffs";
import type { FileDiffMetadata, SupportedLanguages } from "@pierre/diffs";

const defaultThemes = [DEFAULT_THEMES.dark, DEFAULT_THEMES.light] as const;

/**
 * Pierre's React FileDiff paints an empty shadow `<pre>` when the shared
 * highlighter is still loading, and the async follow-up render does not always
 * fill it. Preload themes (and the languages we are about to show) so the first
 * mounted render can take the synchronous path.
 */
export function preloadFileDiffHighlighter(
  fileDiffs: readonly FileDiffMetadata[]
) {
  const languages = new Set<SupportedLanguages>(["text"]);

  for (const fileDiff of fileDiffs) {
    languages.add(fileDiff.lang ?? getFiletypeFromFileName(fileDiff.name));
  }

  return preloadHighlighter({
    langs: [...languages],
    themes: [...defaultThemes],
  });
}
