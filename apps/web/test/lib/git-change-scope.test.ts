import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import {
  gitChangeScopePreferenceOrder,
  resolvePreferredGitChangeScope,
} from "../../src/lib/git-change-scope.ts";

test("gitChangeScopePreferenceOrder is unstaged then staged then committed", () => {
  deepStrictEqual(gitChangeScopePreferenceOrder, [
    "unstaged",
    "staged",
    "committed",
  ]);
});

test("resolvePreferredGitChangeScope prefers unstaged when it has changes", () => {
  strictEqual(
    resolvePreferredGitChangeScope({
      committed: true,
      staged: true,
      unstaged: true,
    }),
    "unstaged"
  );
});

test("resolvePreferredGitChangeScope falls back to staged when unstaged is empty", () => {
  strictEqual(
    resolvePreferredGitChangeScope({
      committed: true,
      staged: true,
      unstaged: false,
    }),
    "staged"
  );
});

test("resolvePreferredGitChangeScope falls back to committed when earlier scopes are empty", () => {
  strictEqual(
    resolvePreferredGitChangeScope({
      committed: true,
      staged: false,
      unstaged: false,
    }),
    "committed"
  );
});

test("resolvePreferredGitChangeScope returns undefined when no scope has changes", () => {
  strictEqual(
    resolvePreferredGitChangeScope({
      committed: false,
      staged: false,
      unstaged: false,
    }),
    undefined
  );
});

test("resolvePreferredGitChangeScope does not fall through past unknown availability", () => {
  strictEqual(
    resolvePreferredGitChangeScope({
      committed: true,
      unstaged: false,
    }),
    undefined
  );
});

test("resolvePreferredGitChangeScope stops when the first scope is unknown", () => {
  strictEqual(
    resolvePreferredGitChangeScope({
      committed: true,
      staged: true,
    }),
    undefined
  );
});
