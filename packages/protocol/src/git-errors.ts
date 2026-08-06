import { Schema } from "effect";

const NonEmptyString = Schema.String.check(Schema.isNonEmpty());

export class GitChangedFilesError extends Schema.TaggedErrorClass<GitChangedFilesError>(
  "lazydiff/protocol/GitChangedFilesError"
)("GitChangedFilesError", {
  message: NonEmptyString,
}) {}
