import { Schema } from "effect";

const NonEmptyString = Schema.String.check(Schema.isNonEmpty());

export class GitDiffError extends Schema.TaggedErrorClass<GitDiffError>(
  "lazydiff/protocol/GitDiffError"
)("GitDiffError", {
  message: NonEmptyString,
}) {}
