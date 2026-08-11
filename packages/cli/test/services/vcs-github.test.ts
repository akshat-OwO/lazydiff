import { match, ok, strictEqual } from "node:assert";
import { test } from "node:test";

import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Stream } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { GithubAuthLive } from "../../src/services/github-auth.ts";
import { GithubLive } from "../../src/services/vcs-github.ts";
import { VCSService } from "../../src/services/vcs.ts";

const GithubAuthTestLive = GithubAuthLive.pipe(
  Layer.provide(NodeServices.layer)
);

const GithubTestLive = GithubLive.pipe(
  Layer.provide(GithubAuthTestLive),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(NodeServices.layer)
);

test("GithubLive opens a public pull request and streams its files", async () => {
  const { batches, session } = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    const opened = yield* vcs.openPullRequest(
      "https://github.com/akshat-OwO/weave/pull/1"
    );

    return {
      batches: yield* Stream.runCollect(opened.fileBatches),
      session: opened,
    };
  }).pipe(Effect.provide(GithubTestLive), Effect.runPromise);

  strictEqual(session.owner, "akshat-OwO");
  strictEqual(session.repo, "weave");
  strictEqual(session.number, 1);
  strictEqual(session.baseRefName, "main");
  ok(session.headRefName.length > 0);
  ok(session.title.length > 0);

  const entries = batches.flatMap((batch) => batch.entries);
  const patch = batches.map((batch) => batch.patch).join("");

  ok(entries.length > 0);
  ok(patch.includes("diff --git"));
  strictEqual(
    entries.some((entry) => entry.path === "README.md"),
    true
  );
});

test("GithubLive rejects unsupported pull request URLs", async () => {
  const error = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs
      .openPullRequest("https://example.com/not-a-pr")
      .pipe(Effect.flip);
  }).pipe(Effect.provide(GithubTestLive), Effect.runPromise);

  strictEqual(error._tag, "VcsError");
  strictEqual(error.reason, "InvalidPullRequestUrl");
  match(error.message, /Unsupported pull request URL/u);
});
