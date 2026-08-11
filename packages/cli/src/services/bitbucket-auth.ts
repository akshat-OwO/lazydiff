import { Config, Context, Effect, Layer, Option, Redacted } from "effect";

export interface BitbucketCredentials {
  readonly email: Option.Option<string>;
  readonly token: Redacted.Redacted<string>;
}

const readBitbucketTokenFromEnv = Effect.gen(function* () {
  const token = yield* Config.option(Config.redacted("BITBUCKET_TOKEN")).pipe(
    Effect.orElseSucceed(() => Option.none())
  );

  return Option.match(token, {
    onNone: () => Option.none<Redacted.Redacted<string>>(),
    onSome: (value) => {
      const trimmed = Redacted.value(value).trim();

      return trimmed.length > 0
        ? Option.some(Redacted.make(trimmed))
        : Option.none();
    },
  });
});

const readBitbucketEmailFromEnv = Effect.gen(function* () {
  const email = yield* Config.option(Config.string("BITBUCKET_EMAIL")).pipe(
    Effect.orElseSucceed(() => Option.none())
  );

  return Option.match(email, {
    onNone: () => Option.none<string>(),
    onSome: (value) => {
      const trimmed = value.trim();

      return trimmed.length > 0 ? Option.some(trimmed) : Option.none();
    },
  });
});

const make = Effect.sync(() => {
  /**
   * Resolves Bitbucket credentials from `BITBUCKET_TOKEN` and optional
   * `BITBUCKET_EMAIL`.
   *
   * API tokens authenticate with Basic auth (`email:token`). Repository and
   * workspace access tokens authenticate as Bearer tokens when no email is set.
   */
  const resolveCredentials = Effect.fn(
    "lazydiff/services/bitbucketAuth/resolveCredentials"
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

  return { resolveCredentials };
});

export class BitbucketAuth extends Context.Service<
  BitbucketAuth,
  Effect.Success<typeof make>
>()("lazydiff/services/bitbucketAuth") {}

export const BitbucketAuthLive = Layer.effect(BitbucketAuth, make);
