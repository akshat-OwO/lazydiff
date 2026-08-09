import { Schema } from "effect";

const GitBranchErrorFields = {
  message: Schema.String,
};

export class GitBranchError extends Schema.TaggedErrorClass<GitBranchError>(
  "@lazydiff/protocol/GitBranchError"
)("GitBranchError", GitBranchErrorFields) {}
