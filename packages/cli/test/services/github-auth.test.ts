import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { NodeServices } from "@effect/platform-node";
import { Effect, Option, Redacted } from "effect";

import { resolveGithubToken } from "../../src/services/github-auth.ts";

test("resolveGithubToken prefers GITHUB_TOKEN over gh auth", async () => {
  const previous = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "env-test-token";

  try {
    const token = await resolveGithubToken().pipe(
      Effect.provide(NodeServices.layer),
      Effect.runPromise
    );

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

test("resolveGithubToken returns none when env is empty and gh is unavailable", async () => {
  const previousToken = process.env.GITHUB_TOKEN;
  const previousGhConfig = process.env.GH_CONFIG_DIR;
  delete process.env.GITHUB_TOKEN;
  process.env.GH_CONFIG_DIR = "/tmp/lazydiff-empty-gh-config";

  try {
    const token = await resolveGithubToken().pipe(
      Effect.provide(NodeServices.layer),
      Effect.runPromise
    );

    deepStrictEqual(token, Option.none());
  } finally {
    if (previousToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previousToken;
    }

    if (previousGhConfig === undefined) {
      delete process.env.GH_CONFIG_DIR;
    } else {
      process.env.GH_CONFIG_DIR = previousGhConfig;
    }
  }
});
