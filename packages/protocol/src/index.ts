import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

import { GitChangedFilesError } from "./git-errors.ts";
import { GitStatusError } from "./git-status-error.ts";

export { GitChangedFilesError } from "./git-errors.ts";
export { GitStatusError } from "./git-status-error.ts";

export const BrandId = Schema.Literals([
  "git.branch.subscribe",
  "git.branch.changed",
  "git.changed-files.get",
  "git.changed-files.result",
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

const GitChangedFilesGetRpc = Rpc.make("git.changed-files.get", {
  error: GitChangedFilesError,
  payload: GitChangedFilesGet,
  success: GitChangedFilesResult,
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
  GitBranchSubscribeRpc,
  GitChangedFilesGetRpc,
  GitStatusGetRpc,
  GitStatusSubscribeRpc
) {}
