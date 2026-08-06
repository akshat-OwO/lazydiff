import type { GitStatusEntry } from "@lazydiff/protocol";

export type ChangedPath =
  | {
      readonly _tag: "Directory";
      readonly entries: readonly GitStatusEntry[];
      readonly path: string;
    }
  | { readonly _tag: "File"; readonly entry: GitStatusEntry }
  | { readonly _tag: "Unknown"; readonly path: string };

/**
 * Repository paths are relative and slash separated, so leading and trailing
 * separators from the URL are not part of the path itself.
 */
export function normalizeChangedPath(splat: string | undefined) {
  return (splat ?? "").replace(/^\/+/u, "").replace(/\/+$/u, "");
}

export function resolveChangedPath(
  entries: readonly GitStatusEntry[],
  path: string
): ChangedPath {
  const entry = entries.find((candidate) => candidate.path === path);

  if (entry !== undefined) {
    return { _tag: "File", entry };
  }

  const prefix = `${path}/`;
  const directoryEntries = entries.filter((candidate) =>
    candidate.path.startsWith(prefix)
  );

  return directoryEntries.length > 0
    ? { _tag: "Directory", entries: directoryEntries, path }
    : { _tag: "Unknown", path };
}
