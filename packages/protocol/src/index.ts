import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export const BrandId = Schema.Literals([
  "git.branch.subscribe",
  "git.branch.changed",
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

const GitBranchSubscribeRpc = Rpc.make("git.branch.subscribe", {
  payload: GitBranchSubscribe,
  stream: true,
  success: GitBranchChanged,
});

export class LazyDiffRpcs extends RpcGroup.make(GitBranchSubscribeRpc) {}
