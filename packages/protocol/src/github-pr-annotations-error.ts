import { Schema } from "effect";

const NonEmptyString = Schema.String.check(Schema.isNonEmpty());

export class GithubPrAnnotationsError extends Schema.TaggedErrorClass<GithubPrAnnotationsError>(
  "lazydiff/protocol/GithubPrAnnotationsError"
)("GithubPrAnnotationsError", {
  message: NonEmptyString,
}) {}
