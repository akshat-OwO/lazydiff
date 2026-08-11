import { deepStrictEqual, match, ok, strictEqual } from "node:assert";
import { test } from "node:test";

import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Stream } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { BitbucketAuthLive } from "../../src/services/bitbucket-auth.ts";
import { GithubAuthLive } from "../../src/services/github-auth.ts";
import { BitbucketLive } from "../../src/services/vcs-bitbucket.ts";
import { VcsLive } from "../../src/services/vcs-live.ts";
import { VCSService } from "../../src/services/vcs.ts";

const BitbucketTestLive = BitbucketLive.pipe(
  Layer.provide(BitbucketAuthLive),
  Layer.provide(FetchHttpClient.layer)
);

const CombinedTestLive = VcsLive.pipe(
  Layer.provide(GithubAuthLive.pipe(Layer.provide(NodeServices.layer))),
  Layer.provide(BitbucketAuthLive),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(NodeServices.layer)
);

test("BitbucketLive opens a public pull request and streams its files", async () => {
  const { batches, session } = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    const opened = yield* vcs.openPullRequest(
      "https://bitbucket.org/bitbucketpipelines/official-pipes/pull-requests/897"
    );

    return {
      batches: yield* Stream.runCollect(opened.fileBatches),
      session: opened,
    };
  }).pipe(Effect.provide(BitbucketTestLive), Effect.runPromise);

  strictEqual(session.host, "bitbucket.org");
  strictEqual(session.owner, "bitbucketpipelines");
  strictEqual(session.repo, "official-pipes");
  strictEqual(session.number, 897);
  strictEqual(session.baseRefName, "master");
  ok(session.headRefName.length > 0);
  ok(session.title.length > 0);
  ok(session.headSha.length >= 12);

  const entries = batches.flatMap((batch) => batch.entries);
  const patch = batches.map((batch) => batch.patch).join("");

  ok(entries.length > 0);
  ok(patch.includes("diff --git"));
  deepStrictEqual(
    entries.some((entry) => entry.path === "pipes/trustabl-pipe.yml"),
    true
  );
});

test("BitbucketLive rejects unsupported pull request URLs", async () => {
  const error = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs
      .openPullRequest("https://github.com/owner/repo/pull/1")
      .pipe(Effect.flip);
  }).pipe(Effect.provide(BitbucketTestLive), Effect.runPromise);

  strictEqual(error._tag, "VcsError");
  strictEqual(error.reason, "InvalidPullRequestUrl");
  match(error.message, /Unsupported pull request URL/u);
});

test("VcsLive routes Bitbucket pull request URLs", async () => {
  const session = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs.openPullRequest(
      "https://bitbucket.org/bitbucketpipelines/official-pipes/pull-requests/897"
    );
  }).pipe(Effect.provide(CombinedTestLive), Effect.runPromise);

  strictEqual(session.host, "bitbucket.org");
  strictEqual(session.number, 897);
});

test("VcsLive rejects unsupported pull request URLs for either host", async () => {
  const error = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs
      .openPullRequest("https://gitlab.com/owner/repo/merge_requests/1")
      .pipe(Effect.flip);
  }).pipe(Effect.provide(CombinedTestLive), Effect.runPromise);

  strictEqual(error._tag, "VcsError");
  strictEqual(error.reason, "InvalidPullRequestUrl");
  match(error.message, /GitHub URL/u);
  match(error.message, /Bitbucket URL/u);
});
