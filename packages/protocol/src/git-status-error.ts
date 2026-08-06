import { Schema } from "effect";

const NonEmptyString = Schema.String.check(Schema.isNonEmpty());

export class GitStatusError extends Schema.TaggedErrorClass<GitStatusError>(
  "lazydiff/protocol/GitStatusError"
)("GitStatusError", {
  message: NonEmptyString,
}) {}
