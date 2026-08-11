import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { ConfigProvider, Effect, Option, Redacted } from "effect";

import {
  BitbucketAuth,
  BitbucketAuthLive,
} from "../../src/services/bitbucket-auth.ts";

const bitbucketAuthConfig = (env: Record<string, string>) =>
  ConfigProvider.layer(ConfigProvider.fromEnv({ env }));

test("BitbucketAuth reads BITBUCKET_TOKEN and optional email", async () => {
  const credentials = await Effect.gen(function* () {
    const bitbucketAuth = yield* BitbucketAuth;
    return yield* bitbucketAuth.resolveCredentials();
  }).pipe(
    Effect.provide(BitbucketAuthLive),
    Effect.provide(
      bitbucketAuthConfig({
        BITBUCKET_EMAIL: "dev@example.com",
        BITBUCKET_TOKEN: "bb-test-token",
      })
    ),
    Effect.runPromise
  );

  strictEqual(Option.isSome(credentials), true);
  if (Option.isSome(credentials)) {
    strictEqual(Redacted.value(credentials.value.token), "bb-test-token");
    deepStrictEqual(credentials.value.email, Option.some("dev@example.com"));
  }
});

test("BitbucketAuth returns none without BITBUCKET_TOKEN", async () => {
  const credentials = await Effect.gen(function* () {
    const bitbucketAuth = yield* BitbucketAuth;
    return yield* bitbucketAuth.resolveCredentials();
  }).pipe(
    Effect.provide(BitbucketAuthLive),
    Effect.provide(
      bitbucketAuthConfig({
        BITBUCKET_EMAIL: "dev@example.com",
      })
    ),
    Effect.runPromise
  );

  deepStrictEqual(credentials, Option.none());
});
