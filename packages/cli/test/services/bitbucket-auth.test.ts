import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { Effect, Option, Redacted } from "effect";

import { resolveBitbucketCredentials } from "../../src/services/bitbucket-auth.ts";

test("resolveBitbucketCredentials reads BITBUCKET_TOKEN and optional email", async () => {
  const previousToken = process.env.BITBUCKET_TOKEN;
  const previousEmail = process.env.BITBUCKET_EMAIL;
  process.env.BITBUCKET_TOKEN = "bb-test-token";
  process.env.BITBUCKET_EMAIL = "dev@example.com";

  try {
    const credentials = await Effect.runPromise(resolveBitbucketCredentials());

    strictEqual(Option.isSome(credentials), true);
    if (Option.isSome(credentials)) {
      strictEqual(Redacted.value(credentials.value.token), "bb-test-token");
      deepStrictEqual(credentials.value.email, Option.some("dev@example.com"));
    }
  } finally {
    if (previousToken === undefined) {
      delete process.env.BITBUCKET_TOKEN;
    } else {
      process.env.BITBUCKET_TOKEN = previousToken;
    }

    if (previousEmail === undefined) {
      delete process.env.BITBUCKET_EMAIL;
    } else {
      process.env.BITBUCKET_EMAIL = previousEmail;
    }
  }
});

test("resolveBitbucketCredentials returns none without BITBUCKET_TOKEN", async () => {
  const previousToken = process.env.BITBUCKET_TOKEN;
  const previousEmail = process.env.BITBUCKET_EMAIL;
  delete process.env.BITBUCKET_TOKEN;
  process.env.BITBUCKET_EMAIL = "dev@example.com";

  try {
    const credentials = await Effect.runPromise(resolveBitbucketCredentials());
    deepStrictEqual(credentials, Option.none());
  } finally {
    if (previousToken === undefined) {
      delete process.env.BITBUCKET_TOKEN;
    } else {
      process.env.BITBUCKET_TOKEN = previousToken;
    }

    if (previousEmail === undefined) {
      delete process.env.BITBUCKET_EMAIL;
    } else {
      process.env.BITBUCKET_EMAIL = previousEmail;
    }
  }
});
