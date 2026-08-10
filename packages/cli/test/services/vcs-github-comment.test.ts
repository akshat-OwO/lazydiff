import { match, strictEqual } from "node:assert";
import { test } from "node:test";

import { NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import type { HttpClientRequest } from "effect/unstable/http";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { GithubLive } from "../../src/services/vcs-github.ts";
import { VCSService } from "../../src/services/vcs.ts";
import type { PullRequestRef } from "../../src/services/vcs.ts";

const pullRequestRef: PullRequestRef = {
  host: "github.com",
  number: 3,
  owner: "akshat-OwO",
  repo: "contingency",
};

const makeRecordingHttpClient = (
  handler: (request: HttpClientRequest.HttpClientRequest) => Response
) =>
  HttpClient.makeWith(
    (requestEffect) =>
      requestEffect.pipe(
        Effect.flatMap((request) =>
          Effect.succeed(HttpClientResponse.fromWeb(request, handler(request)))
        )
      ),
    (request) => Effect.succeed(request)
  );

test("createPullRequestIssueComment posts markdown to the issues comments API", async () => {
  const previous = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "test-token";

  let captured: HttpClientRequest.HttpClientRequest | undefined;

  const FakeHttpLive = Layer.succeed(
    HttpClient.HttpClient,
    makeRecordingHttpClient((request) => {
      captured = request;
      return Response.json(
        {
          html_url:
            "https://github.com/akshat-OwO/contingency/pull/3#issuecomment-1",
        },
        { status: 201 }
      );
    })
  );

  try {
    const comment = await Effect.gen(function* () {
      const vcs = yield* VCSService;
      return yield* vcs.createPullRequestIssueComment(
        pullRequestRef,
        "### Annotation 1\n\nLooks good."
      );
    }).pipe(
      Effect.provide(
        GithubLive.pipe(
          Layer.provide(FakeHttpLive),
          Layer.provide(NodeServices.layer)
        )
      ),
      Effect.runPromise
    );

    strictEqual(
      comment.htmlUrl,
      "https://github.com/akshat-OwO/contingency/pull/3#issuecomment-1"
    );
    strictEqual(captured?.method, "POST");
    strictEqual(
      captured?.url,
      "https://api.github.com/repos/akshat-OwO/contingency/issues/3/comments"
    );

    const bodyText =
      captured?.body._tag === "Uint8Array"
        ? new TextDecoder().decode(captured.body.body)
        : undefined;
    strictEqual(
      bodyText,
      JSON.stringify({ body: "### Annotation 1\n\nLooks good." })
    );
  } finally {
    if (previous === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previous;
    }
  }
});

test("createPullRequestIssueComment requires authentication", async () => {
  const previousToken = process.env.GITHUB_TOKEN;
  const previousGhConfig = process.env.GH_CONFIG_DIR;
  delete process.env.GITHUB_TOKEN;
  process.env.GH_CONFIG_DIR = "/tmp/lazydiff-empty-gh-config";

  const FakeHttpLive = Layer.succeed(
    HttpClient.HttpClient,
    makeRecordingHttpClient(() => new Response("unused", { status: 500 }))
  );

  try {
    const error = await Effect.gen(function* () {
      const vcs = yield* VCSService;
      return yield* vcs
        .createPullRequestIssueComment(pullRequestRef, "comment")
        .pipe(Effect.flip);
    }).pipe(
      Effect.provide(
        GithubLive.pipe(
          Layer.provide(FakeHttpLive),
          Layer.provide(NodeServices.layer)
        )
      ),
      Effect.runPromise
    );

    strictEqual(error._tag, "VcsError");
    strictEqual(error.reason, "AuthenticationRequired");
    match(error.message, /authentication is required to comment/iu);
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
