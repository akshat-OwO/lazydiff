import { match, ok, strictEqual } from "node:assert";
import { test } from "node:test";

import { Effect, Layer } from "effect";
import type { HttpClientRequest } from "effect/unstable/http";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { BitbucketLive } from "../../src/services/vcs-bitbucket.ts";
import { VCSService } from "../../src/services/vcs.ts";
import type { PullRequestRef } from "../../src/services/vcs.ts";

const pullRequestRef: PullRequestRef = {
  host: "bitbucket.org",
  number: 3,
  owner: "acme",
  repo: "demo",
};

const makeRecordingHttpClient = (
  handler: (request: HttpClientRequest.HttpClientRequest) => Response
): HttpClient.HttpClient =>
  HttpClient.make((request, _url, _signal, _fiber) =>
    Effect.succeed(HttpClientResponse.fromWeb(request, handler(request)))
  );

const decodeRequestBody = (
  request: HttpClientRequest.HttpClientRequest | undefined
) => {
  if (request?.body._tag !== "Uint8Array") {
    return;
  }

  return JSON.parse(new TextDecoder().decode(request.body.body)) as unknown;
};

test("createPullRequestReview posts inline Bitbucket comments", async () => {
  const previousToken = process.env.BITBUCKET_TOKEN;
  const previousEmail = process.env.BITBUCKET_EMAIL;
  process.env.BITBUCKET_TOKEN = "test-token";
  process.env.BITBUCKET_EMAIL = "dev@example.com";

  let captured: HttpClientRequest.HttpClientRequest | undefined;

  const FakeHttpLive = Layer.succeed(
    HttpClient.HttpClient,
    makeRecordingHttpClient((request) => {
      captured = request;
      return Response.json(
        {
          content: { raw: "Looks good." },
          created_on: "2026-08-10T00:00:00.000000+00:00",
          id: 42,
          links: {
            html: {
              href: "https://bitbucket.org/acme/demo/pull-requests/3/_/diff#comment-42",
            },
          },
          user: { nickname: "dev" },
        },
        { status: 201 }
      );
    })
  );

  try {
    const review = await Effect.gen(function* () {
      const vcs = yield* VCSService;
      return yield* vcs.createPullRequestReview(
        pullRequestRef,
        "0123456789abcdef0123456789abcdef01234567",
        [
          {
            body: "Looks good.",
            line: 9,
            path: "src/app.ts",
            side: "RIGHT",
          },
        ]
      );
    }).pipe(
      Effect.provide(BitbucketLive.pipe(Layer.provide(FakeHttpLive))),
      Effect.runPromise
    );

    strictEqual(
      review.htmlUrl,
      "https://bitbucket.org/acme/demo/pull-requests/3/_/diff#comment-42"
    );
    strictEqual(captured?.method, "POST");
    strictEqual(
      captured?.url,
      "https://api.bitbucket.org/2.0/repositories/acme/demo/pullrequests/3/comments"
    );

    const body = decodeRequestBody(captured);
    ok(body !== undefined && typeof body === "object");
    const record = body as {
      content: { raw: string };
      inline: { path: string; to: number };
    };
    strictEqual(record.content.raw, "Looks good.");
    strictEqual(record.inline.path, "src/app.ts");
    strictEqual(record.inline.to, 9);
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

test("createPullRequestReview requires Bitbucket authentication", async () => {
  const previousToken = process.env.BITBUCKET_TOKEN;
  const previousEmail = process.env.BITBUCKET_EMAIL;
  delete process.env.BITBUCKET_TOKEN;
  delete process.env.BITBUCKET_EMAIL;

  const FakeHttpLive = Layer.succeed(
    HttpClient.HttpClient,
    makeRecordingHttpClient(() => new Response("unused", { status: 500 }))
  );

  try {
    const error = await Effect.gen(function* () {
      const vcs = yield* VCSService;
      return yield* vcs
        .createPullRequestReview(pullRequestRef, "abc", [
          {
            body: "comment",
            line: 1,
            path: "a.ts",
            side: "RIGHT",
          },
        ])
        .pipe(Effect.flip);
    }).pipe(
      Effect.provide(BitbucketLive.pipe(Layer.provide(FakeHttpLive))),
      Effect.runPromise
    );

    strictEqual(error._tag, "VcsError");
    strictEqual(error.reason, "AuthenticationRequired");
    match(error.message, /authentication is required to comment/iu);
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
