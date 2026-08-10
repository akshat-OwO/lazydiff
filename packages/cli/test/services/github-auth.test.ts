import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { NodeServices } from "@effect/platform-node";
import { ConfigProvider, Effect, Layer, Option, Redacted } from "effect";

import { GithubAuth, GithubAuthLive } from "../../src/services/github-auth.ts";

const makeGithubAuthTestLive = (env: Record<string, string>) =>
  GithubAuthLive.pipe(
    Layer.provide(NodeServices.layer),
    Layer.provideMerge(ConfigProvider.layer(ConfigProvider.fromEnv({ env })))
  );

test("GithubAuth prefers GITHUB_TOKEN over gh auth", async () => {
  const token = await Effect.gen(function* () {
    const githubAuth = yield* GithubAuth;
    return yield* githubAuth.resolveToken();
  }).pipe(
    Effect.provide(
      makeGithubAuthTestLive({
        GITHUB_TOKEN: "env-test-token",
      })
    ),
    Effect.runPromise
  );

  strictEqual(Option.isSome(token), true);
  if (Option.isSome(token)) {
    strictEqual(Redacted.value(token.value), "env-test-token");
  }
});

test("GithubAuth returns none when env is empty and gh is unavailable", async () => {
  const previousToken = process.env.GITHUB_TOKEN;
  const previousGhConfig = process.env.GH_CONFIG_DIR;
  const previousGhToken = process.env.GH_TOKEN;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  process.env.GH_CONFIG_DIR = "/tmp/lazydiff-empty-gh-config";

  try {
    const token = await Effect.gen(function* () {
      const githubAuth = yield* GithubAuth;
      return yield* githubAuth.resolveToken();
    }).pipe(Effect.provide(makeGithubAuthTestLive({})), Effect.runPromise);

    deepStrictEqual(token, Option.none());
  } finally {
    if (previousToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previousToken;
    }

    if (previousGhToken === undefined) {
      delete process.env.GH_TOKEN;
    } else {
      process.env.GH_TOKEN = previousGhToken;
    }

    if (previousGhConfig === undefined) {
      delete process.env.GH_CONFIG_DIR;
    } else {
      process.env.GH_CONFIG_DIR = previousGhConfig;
    }
  }
});
