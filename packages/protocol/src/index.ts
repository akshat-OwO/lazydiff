import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

import { GitBranchError } from "./git-branch-error.ts";
import { GitDiffError } from "./git-diff-error.ts";
import { GitChangedFilesError } from "./git-errors.ts";
import { GitStatusError } from "./git-status-error.ts";

export { GitBranchError } from "./git-branch-error.ts";
export { GitDiffError } from "./git-diff-error.ts";
export { GitChangedFilesError } from "./git-errors.ts";
export { GitStatusError } from "./git-status-error.ts";

export const BrandId = Schema.Literals([
  "git.branch.create",
  "git.branch.created",
  "git.branch.delete",
  "git.branch.deleted",
  "git.branch.switch",
  "git.branch.switched",
  "git.branch.subscribe",
  "git.branch.changed",
  "git.branches.get",
  "git.branches.result",
  "git.changed-files.get",
  "git.changed-files.result",
  "git.diff.subscribe",
  "git.diff.result",
  "git.repository.get",
  "git.repository.result",
  "git.status.get",
  "git.status.result",
  "git.status.subscribe",
]);

export type BrandId = typeof BrandId.Type;

export const GitBranchSubscribe = Schema.Struct({
  data: Schema.Struct({}),
  type: Schema.Literal("git.branch.subscribe"),
});

export type GitBranchSubscribe = typeof GitBranchSubscribe.Type;

const NonEmptyString = Schema.String.check(Schema.isNonEmpty());

export const GitBranch = Schema.Struct({
  current: Schema.Boolean,
  isRemote: Schema.Boolean,
  localName: Schema.optional(NonEmptyString),
  name: NonEmptyString,
  remoteName: Schema.optional(NonEmptyString),
});

export type GitBranch = typeof GitBranch.Type;

export const GitBranchesGet = Schema.Struct({
  data: Schema.Struct({}),
  type: Schema.Literal("git.branches.get"),
});

export type GitBranchesGet = typeof GitBranchesGet.Type;

export const GitBranchesResult = Schema.Struct({
  data: Schema.Struct({
    branches: Schema.Array(GitBranch),
  }),
  type: Schema.Literal("git.branches.result"),
});

export type GitBranchesResult = typeof GitBranchesResult.Type;

export const GitBranchCreate = Schema.Struct({
  data: Schema.Struct({
    name: NonEmptyString,
  }),
  type: Schema.Literal("git.branch.create"),
});

export type GitBranchCreate = typeof GitBranchCreate.Type;

export const GitBranchCreated = Schema.Struct({
  data: Schema.Struct({
    head: Schema.Struct({
      _tag: Schema.Literal("Branch"),
      name: NonEmptyString,
    }),
  }),
  type: Schema.Literal("git.branch.created"),
});

export type GitBranchCreated = typeof GitBranchCreated.Type;

export const GitBranchDeleteTarget = Schema.Literals([
  "local",
  "remote",
  "both",
]);

export type GitBranchDeleteTarget = typeof GitBranchDeleteTarget.Type;

export const GitBranchDelete = Schema.Struct({
  data: Schema.Struct({
    localName: Schema.optional(NonEmptyString),
    remoteName: Schema.optional(NonEmptyString),
    target: GitBranchDeleteTarget,
  }),
  type: Schema.Literal("git.branch.delete"),
});

export type GitBranchDelete = typeof GitBranchDelete.Type;

export const GitBranchDeleted = Schema.Struct({
  data: Schema.Struct({}),
  type: Schema.Literal("git.branch.deleted"),
});

export type GitBranchDeleted = typeof GitBranchDeleted.Type;

export const GitBranchSwitch = Schema.Struct({
  data: Schema.Struct({
    name: NonEmptyString,
  }),
  type: Schema.Literal("git.branch.switch"),
});

export type GitBranchSwitch = typeof GitBranchSwitch.Type;

export const GitHead = Schema.Union([
  Schema.TaggedStruct("Branch", {
    name: NonEmptyString,
  }),
  Schema.TaggedStruct("Detached", {
    commit: NonEmptyString,
  }),
]);

export type GitHead = typeof GitHead.Type;

export const GitBranchChanged = Schema.Struct({
  data: Schema.Struct({
    head: GitHead,
  }),
  type: Schema.Literal("git.branch.changed"),
});

export type GitBranchChanged = typeof GitBranchChanged.Type;

export const GitBranchSwitched = Schema.Struct({
  data: Schema.Struct({
    head: GitHead,
  }),
  type: Schema.Literal("git.branch.switched"),
});

export type GitBranchSwitched = typeof GitBranchSwitched.Type;

export const GitChangeScope = Schema.Literals([
  "unstaged",
  "staged",
  "committed",
]);

export type GitChangeScope = typeof GitChangeScope.Type;

export const GitChangedFilesGet = Schema.Struct({
  data: Schema.Struct({
    branch: Schema.optional(NonEmptyString),
    scope: GitChangeScope,
  }),
  type: Schema.Literal("git.changed-files.get"),
});

export type GitChangedFilesGet = typeof GitChangedFilesGet.Type;

export const GitChangedFilesResult = Schema.Struct({
  data: Schema.Struct({
    files: Schema.Array(NonEmptyString),
  }),
  type: Schema.Literal("git.changed-files.result"),
});

export type GitChangedFilesResult = typeof GitChangedFilesResult.Type;

export const GitFileStatus = Schema.Literals([
  "added",
  "deleted",
  "modified",
  "renamed",
  "untracked",
]);

export type GitFileStatus = typeof GitFileStatus.Type;

export const GitStatusEntry = Schema.Struct({
  path: NonEmptyString,
  status: GitFileStatus,
});

export type GitStatusEntry = typeof GitStatusEntry.Type;

export const GitDiffSubscribe = Schema.Struct({
  data: Schema.Struct({
    branch: Schema.optional(NonEmptyString),
    scope: GitChangeScope,
  }),
  type: Schema.Literal("git.diff.subscribe"),
});

export type GitDiffSubscribe = typeof GitDiffSubscribe.Type;

export const GitDiffResult = Schema.Struct({
  data: Schema.Struct({
    /**
     * Unified patch covering every file in the scope, empty when the scope has
     * no textual changes.
     */
    patch: Schema.String,
  }),
  type: Schema.Literal("git.diff.result"),
});

export type GitDiffResult = typeof GitDiffResult.Type;

export const GitRepositoryGet = Schema.Struct({
  data: Schema.Struct({}),
  type: Schema.Literal("git.repository.get"),
});

export type GitRepositoryGet = typeof GitRepositoryGet.Type;

export const GitReviewSource = Schema.Literals([
  "working-tree",
  "pull-request",
]);

export type GitReviewSource = typeof GitReviewSource.Type;

export const GitRepositoryResult = Schema.Struct({
  data: Schema.Struct({
    name: NonEmptyString,
    source: GitReviewSource,
  }),
  type: Schema.Literal("git.repository.result"),
});

export type GitRepositoryResult = typeof GitRepositoryResult.Type;

export const GitStatusGet = Schema.Struct({
  data: Schema.Struct({
    branch: Schema.optional(NonEmptyString),
    scope: GitChangeScope,
  }),
  type: Schema.Literal("git.status.get"),
});

export type GitStatusGet = typeof GitStatusGet.Type;

export const GitStatusSubscribe = Schema.Struct({
  data: Schema.Struct({
    branch: Schema.optional(NonEmptyString),
    scope: GitChangeScope,
  }),
  type: Schema.Literal("git.status.subscribe"),
});

export type GitStatusSubscribe = typeof GitStatusSubscribe.Type;

export const GitStatusResult = Schema.Struct({
  data: Schema.Struct({
    entries: Schema.Array(GitStatusEntry),
  }),
  type: Schema.Literal("git.status.result"),
});

export type GitStatusResult = typeof GitStatusResult.Type;

const GitBranchSubscribeRpc = Rpc.make("git.branch.subscribe", {
  payload: GitBranchSubscribe,
  stream: true,
  success: GitBranchChanged,
});

const GitBranchesGetRpc = Rpc.make("git.branches.get", {
  error: GitBranchError,
  payload: GitBranchesGet,
  success: GitBranchesResult,
});

const GitBranchDeleteRpc = Rpc.make("git.branch.delete", {
  error: GitBranchError,
  payload: GitBranchDelete,
  success: GitBranchDeleted,
});

const GitBranchCreateRpc = Rpc.make("git.branch.create", {
  error: GitBranchError,
  payload: GitBranchCreate,
  success: GitBranchCreated,
});

const GitBranchSwitchRpc = Rpc.make("git.branch.switch", {
  error: GitBranchError,
  payload: GitBranchSwitch,
  success: GitBranchSwitched,
});

const GitChangedFilesGetRpc = Rpc.make("git.changed-files.get", {
  error: GitChangedFilesError,
  payload: GitChangedFilesGet,
  success: GitChangedFilesResult,
});

const GitDiffSubscribeRpc = Rpc.make("git.diff.subscribe", {
  error: GitDiffError,
  payload: GitDiffSubscribe,
  stream: true,
  success: GitDiffResult,
});

const GitRepositoryGetRpc = Rpc.make("git.repository.get", {
  payload: GitRepositoryGet,
  success: GitRepositoryResult,
});

const GitStatusGetRpc = Rpc.make("git.status.get", {
  error: GitStatusError,
  payload: GitStatusGet,
  success: GitStatusResult,
});

const GitStatusSubscribeRpc = Rpc.make("git.status.subscribe", {
  error: GitStatusError,
  payload: GitStatusSubscribe,
  stream: true,
  success: GitStatusResult,
});

export class LazyDiffRpcs extends RpcGroup.make(
  GitBranchCreateRpc,
  GitBranchDeleteRpc,
  GitBranchSwitchRpc,
  GitBranchSubscribeRpc,
  GitBranchesGetRpc,
  GitChangedFilesGetRpc,
  GitDiffSubscribeRpc,
  GitRepositoryGetRpc,
  GitStatusGetRpc,
  GitStatusSubscribeRpc
) {}
