import { deepStrictEqual } from "node:assert";
import { test } from "node:test";

import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Option } from "effect";

import { GithubAuth, GithubAuthLive } from "../../src/services/github-auth.ts";

const GithubAuthTestLive = GithubAuthLive.pipe(
  Layer.provide(NodeServices.layer)
);

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
    }).pipe(Effect.provide(GithubAuthTestLive), Effect.runPromise);

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
