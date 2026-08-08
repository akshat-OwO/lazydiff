import type { GitChangeScope } from "@lazydiff/protocol";

/**
 * Preferred order when automatically choosing which change set to show.
 * The first scope with changes wins.
 */
export const gitChangeScopePreferenceOrder = [
  "unstaged",
  "staged",
  "committed",
] as const satisfies readonly GitChangeScope[];

/**
 * Returns the first scope in preference order that is known to have changes.
 * Scopes omitted from the map (or set to false) are skipped.
 */
export function resolvePreferredGitChangeScope(
  hasChanges: Readonly<Partial<Record<GitChangeScope, boolean>>>
): GitChangeScope | undefined {
  for (const scope of gitChangeScopePreferenceOrder) {
    if (hasChanges[scope] === true) {
      return scope;
    }
  }

  return undefined;
}
