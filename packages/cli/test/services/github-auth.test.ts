import { strictEqual } from "node:assert";
import { test } from "node:test";

import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Option, Redacted } from "effect";

import { GithubAuth, GithubAuthLive } from "../../src/services/github-auth.ts";

const GithubAuthTestLive = GithubAuthLive.pipe(
  Layer.provide(NodeServices.layer)
);

test("GithubAuth prefers GITHUB_TOKEN over gh auth", async () => {
  const previous = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "env-test-token";

  try {
    const token = await Effect.gen(function* () {
      const githubAuth = yield* GithubAuth;
      return yield* githubAuth.resolveToken();
    }).pipe(Effect.provide(GithubAuthTestLive), Effect.runPromise);

    strictEqual(Option.isSome(token), true);
    if (Option.isSome(token)) {
      strictEqual(Redacted.value(token.value), "env-test-token");
    }
  } finally {
    if (previous === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previous;
    }
  }
});
