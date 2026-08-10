import { deepStrictEqual, match, ok, strictEqual } from "node:assert";
import { test } from "node:test";

import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { BitbucketLive } from "../../src/services/vcs-bitbucket.ts";
import { VcsLive } from "../../src/services/vcs-live.ts";
import { VCSService } from "../../src/services/vcs.ts";

const BitbucketTestLive = BitbucketLive.pipe(
  Layer.provide(FetchHttpClient.layer)
);
const CombinedTestLive = VcsLive.pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(NodeServices.layer)
);

test("BitbucketLive fetches a public pull request diff", async () => {
  const review = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs.fetchPullRequest(
      "https://bitbucket.org/bitbucketpipelines/official-pipes/pull-requests/897"
    );
  }).pipe(Effect.provide(BitbucketTestLive), Effect.runPromise);

  strictEqual(review.host, "bitbucket.org");
  strictEqual(review.owner, "bitbucketpipelines");
  strictEqual(review.repo, "official-pipes");
  strictEqual(review.number, 897);
  strictEqual(review.baseRefName, "master");
  ok(review.headRefName.length > 0);
  ok(review.title.length > 0);
  ok(review.headSha.length >= 12);
  ok(review.entries.length > 0);
  ok(review.patch.includes("diff --git"));
  deepStrictEqual(
    review.entries.some((entry) => entry.path === "pipes/trustabl-pipe.yml"),
    true
  );
});

test("BitbucketLive rejects unsupported pull request URLs", async () => {
  const error = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs
      .fetchPullRequest("https://github.com/owner/repo/pull/1")
      .pipe(Effect.flip);
  }).pipe(Effect.provide(BitbucketTestLive), Effect.runPromise);

  strictEqual(error._tag, "VcsError");
  strictEqual(error.reason, "InvalidPullRequestUrl");
  match(error.message, /Unsupported pull request URL/u);
});

test("VcsLive routes Bitbucket pull request URLs", async () => {
  const review = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs.fetchPullRequest(
      "https://bitbucket.org/bitbucketpipelines/official-pipes/pull-requests/897"
    );
  }).pipe(Effect.provide(CombinedTestLive), Effect.runPromise);

  strictEqual(review.host, "bitbucket.org");
  strictEqual(review.number, 897);
});

test("VcsLive rejects unsupported pull request URLs for either host", async () => {
  const error = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs
      .fetchPullRequest("https://gitlab.com/owner/repo/merge_requests/1")
      .pipe(Effect.flip);
  }).pipe(Effect.provide(CombinedTestLive), Effect.runPromise);

  strictEqual(error._tag, "VcsError");
  strictEqual(error.reason, "InvalidPullRequestUrl");
  match(error.message, /GitHub URL/u);
  match(error.message, /Bitbucket URL/u);
});
