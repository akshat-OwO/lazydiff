import { deepStrictEqual, match, ok, strictEqual } from "node:assert";
import { test } from "node:test";

import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { GithubLive } from "../../src/services/vcs-github.ts";
import { VCSService } from "../../src/services/vcs.ts";

const GithubTestLive = GithubLive.pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(NodeServices.layer)
);

test("GithubLive fetches a public pull request diff", async () => {
  const review = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs.fetchPullRequest(
      "https://github.com/akshat-OwO/weave/pull/1"
    );
  }).pipe(Effect.provide(GithubTestLive), Effect.runPromise);

  strictEqual(review.owner, "akshat-OwO");
  strictEqual(review.repo, "weave");
  strictEqual(review.number, 1);
  strictEqual(review.baseRefName, "main");
  ok(review.headRefName.length > 0);
  ok(review.title.length > 0);
  ok(review.entries.length > 0);
  ok(review.patch.includes("diff --git"));
  deepStrictEqual(
    review.entries.some((entry) => entry.path === "README.md"),
    true
  );
});

test("GithubLive rejects unsupported pull request URLs", async () => {
  const error = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs
      .fetchPullRequest("https://example.com/not-a-pr")
      .pipe(Effect.flip);
  }).pipe(Effect.provide(GithubTestLive), Effect.runPromise);

  strictEqual(error._tag, "VcsError");
  strictEqual(error.reason, "InvalidPullRequestUrl");
  match(error.message, /Unsupported pull request URL/u);
});
