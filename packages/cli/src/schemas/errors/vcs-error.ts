import { Data } from "effect";

export class VcsError extends Data.TaggedError("VcsError")<{
  readonly message: string;
  readonly reason:
    | "InvalidPullRequestUrl"
    | "AuthenticationRequired"
    | "NotFound"
    | "HttpError"
    | "DecodeError"
    | "Unsupported"
    | "Truncated";
}> {}
