import { Effect, Option, Redacted } from "effect";

export interface BitbucketCredentials {
  readonly email: Option.Option<string>;
  readonly token: Redacted.Redacted<string>;
}

const readBitbucketTokenFromEnv = Effect.sync(() => {
  const token = process.env.BITBUCKET_TOKEN?.trim();

  return token !== undefined && token.length > 0
    ? Option.some(Redacted.make(token))
    : Option.none<Redacted.Redacted<string>>();
});

const readBitbucketEmailFromEnv = Effect.sync(() => {
  const email = process.env.BITBUCKET_EMAIL?.trim();

  return email !== undefined && email.length > 0
    ? Option.some(email)
    : Option.none<string>();
});

/**
 * Resolves Bitbucket credentials from `BITBUCKET_TOKEN` and optional
 * `BITBUCKET_EMAIL`.
 *
 * API tokens authenticate with Basic auth (`email:token`). Repository and
 * workspace access tokens authenticate as Bearer tokens when no email is set.
 */
export const resolveBitbucketCredentials = Effect.fn(
  "lazydiff/services/bitbucketAuth/resolveBitbucketCredentials"
)(function* () {
  const token = yield* readBitbucketTokenFromEnv;

  if (Option.isNone(token)) {
    return Option.none<BitbucketCredentials>();
  }

  const email = yield* readBitbucketEmailFromEnv;

  return Option.some({
    email,
    token: token.value,
  });
});
