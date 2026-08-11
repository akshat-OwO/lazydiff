/**
 * Assembles a unified diff from GitHub "List pull request files" payloads.
 *
 * The PR-level `application/vnd.github.diff` media type rejects pull requests
 * with more than 300 files (HTTP 406). Per-file `patch` hunks from the files
 * API still work, so large reviews rebuild a synthetic unified patch here.
 */

export interface GithubPullRequestFilePatch {
  readonly filename: string;
  readonly patch?: string | undefined;
  readonly previous_filename?: string | undefined;
  readonly status:
    | "added"
    | "removed"
    | "modified"
    | "renamed"
    | "copied"
    | "changed"
    | "unchanged";
}

const needsGitPathQuotes = (path: string) => {
  if (path.length === 0) {
    return true;
  }

  for (const character of path) {
    if (character === " " || character === '"' || character === "\\") {
      return true;
    }

    const code = character.codePointAt(0) ?? 0;

    if (code < 0x20) {
      return true;
    }
  }

  return false;
};

const quoteGitPath = (path: string) => {
  if (!needsGitPathQuotes(path)) {
    return path;
  }

  let escaped = "";

  for (const character of path) {
    if (character === "\\" || character === '"') {
      escaped += `\\${character}`;
      continue;
    }

    const code = character.codePointAt(0) ?? 0;

    if (code < 0x20) {
      escaped += `\\${code.toString(8).padStart(3, "0")}`;
      continue;
    }

    escaped += character;
  }

  return `"${escaped}"`;
};

const prefixedPath = (side: "a" | "b", path: string) => {
  const joined = `${side}/${path}`;

  return needsGitPathQuotes(path) ? quoteGitPath(joined) : joined;
};

const trimTrailingNewline = (value: string) =>
  value.endsWith("\n") ? value.slice(0, -1) : value;

export const buildUnifiedPatchFromGithubFile = (
  file: GithubPullRequestFilePatch
): string => {
  if (file.status === "unchanged") {
    return "";
  }

  const oldPath = file.previous_filename ?? file.filename;
  const newPath = file.filename;
  const lines: string[] = (() => {
    switch (file.status) {
      case "added":
      case "copied": {
        return [
          `diff --git ${prefixedPath("a", newPath)} ${prefixedPath("b", newPath)}`,
          "new file mode 100644",
          "--- /dev/null",
          `+++ ${prefixedPath("b", newPath)}`,
        ];
      }
      case "removed": {
        return [
          `diff --git ${prefixedPath("a", oldPath)} ${prefixedPath("b", oldPath)}`,
          "deleted file mode 100644",
          `--- ${prefixedPath("a", oldPath)}`,
          "+++ /dev/null",
        ];
      }
      case "renamed": {
        if (file.patch === undefined) {
          return [
            `diff --git ${prefixedPath("a", oldPath)} ${prefixedPath("b", newPath)}`,
            "similarity index 100%",
            `rename from ${oldPath}`,
            `rename to ${newPath}`,
          ];
        }

        return [
          `diff --git ${prefixedPath("a", oldPath)} ${prefixedPath("b", newPath)}`,
          `rename from ${oldPath}`,
          `rename to ${newPath}`,
          `--- ${prefixedPath("a", oldPath)}`,
          `+++ ${prefixedPath("b", newPath)}`,
        ];
      }
      case "modified":
      case "changed": {
        return [
          `diff --git ${prefixedPath("a", oldPath)} ${prefixedPath("b", newPath)}`,
          `--- ${prefixedPath("a", oldPath)}`,
          `+++ ${prefixedPath("b", newPath)}`,
        ];
      }
      default: {
        return [];
      }
    }
  })();

  if (lines.length === 0) {
    return "";
  }

  if (file.patch !== undefined) {
    return `${lines.join("\n")}\n${trimTrailingNewline(file.patch)}`;
  }

  return lines.join("\n");
};

export const buildUnifiedPatchFromGithubFiles = (
  files: readonly GithubPullRequestFilePatch[]
): string => {
  const patches = files.flatMap((file) => {
    const patch = buildUnifiedPatchFromGithubFile(file);

    return patch.length === 0 ? [] : [patch];
  });

  return patches.length === 0 ? "" : `${patches.join("\n")}\n`;
};
