import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import type { GitBranch } from "@lazydiff/protocol";

import {
  branchDeletionAvailability,
  branchNameToCreate,
  filterGitBranches,
} from "../../src/lib/git-branches.ts";

const branches: readonly GitBranch[] = [
  { current: true, isRemote: false, name: "main" },
  { current: false, isRemote: false, name: "feature/Search" },
  { current: false, isRemote: true, name: "origin/release" },
];

test("filterGitBranches matches names case-insensitively", () => {
  deepStrictEqual(
    filterGitBranches(branches, "  SEARCH ").map(({ name }) => name),
    ["feature/Search"]
  );
});

test("branchNameToCreate requires a non-empty name without an exact match", () => {
  strictEqual(branchNameToCreate(branches, " main "), undefined);
  strictEqual(branchNameToCreate(branches, "MAIN"), "MAIN");
  strictEqual(branchNameToCreate(branches, "   "), undefined);
  strictEqual(branchNameToCreate(branches, " feature/new "), "feature/new");
});

test("branchDeletionAvailability reflects local, remote, both, and current refs", () => {
  deepStrictEqual(
    branchDeletionAvailability({
      current: false,
      isRemote: false,
      localName: "feature/both",
      name: "feature/both",
      remoteName: "origin/feature/both",
    }),
    { both: true, local: true, remote: true }
  );
  deepStrictEqual(
    branchDeletionAvailability({
      current: false,
      isRemote: false,
      localName: "feature/local",
      name: "feature/local",
    }),
    { both: false, local: true, remote: false }
  );
  deepStrictEqual(
    branchDeletionAvailability({
      current: false,
      isRemote: true,
      name: "origin/feature/remote",
      remoteName: "origin/feature/remote",
    }),
    { both: false, local: false, remote: true }
  );
  deepStrictEqual(
    branchDeletionAvailability({
      current: true,
      isRemote: false,
      localName: "main",
      name: "main",
      remoteName: "origin/main",
    }),
    { both: false, local: false, remote: true }
  );
});
