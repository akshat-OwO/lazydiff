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
 *
 * A lower-priority scope is only selected when every preceding scope is known
 * empty (`false`). Unknown availability (omitted) stops resolution so a failed
 * lookup cannot fall through past a scope that may still have changes.
 */
export function resolvePreferredGitChangeScope(
  hasChanges: Readonly<Partial<Record<GitChangeScope, boolean>>>
): GitChangeScope | undefined {
  for (const scope of gitChangeScopePreferenceOrder) {
    const availability = hasChanges[scope];

    if (availability === true) {
      return scope;
    }

    if (availability !== false) {
      return undefined;
    }
  }

  return undefined;
}
