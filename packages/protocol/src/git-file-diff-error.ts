import { Schema } from "effect";

const NonEmptyString = Schema.String.check(Schema.isNonEmpty());

export class GitFileDiffError extends Schema.TaggedErrorClass<GitFileDiffError>(
  "lazydiff/protocol/GitFileDiffError"
)("GitFileDiffError", {
  message: NonEmptyString,
}) {}
