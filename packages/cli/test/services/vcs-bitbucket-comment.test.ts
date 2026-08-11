import { deepStrictEqual, match, ok, strictEqual } from "node:assert";
import { test } from "node:test";

import { ConfigProvider, Effect, Layer } from "effect";
import type { HttpClientRequest } from "effect/unstable/http";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { BitbucketAuthLive } from "../../src/services/bitbucket-auth.ts";
import { BitbucketLive } from "../../src/services/vcs-bitbucket.ts";
import { VCSService } from "../../src/services/vcs.ts";
import type { PullRequestRef } from "../../src/services/vcs.ts";

const provideBitbucket = (httpLive: Layer.Layer<HttpClient.HttpClient>) =>
  BitbucketLive.pipe(Layer.provide(BitbucketAuthLive), Layer.provide(httpLive));

const bitbucketAuthConfig = (env: Record<string, string>) =>
  ConfigProvider.layer(ConfigProvider.fromEnv({ env }));

const pullRequestRef: PullRequestRef = {
  host: "bitbucket.org",
  number: 3,
  owner: "acme",
  repo: "demo",
};

const headSha = "0123456789abcdef0123456789abcdef01234567";

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

const pullRequestMetadataResponse = (sha: string) =>
  Response.json({
    destination: { branch: { name: "main" } },
    id: 3,
    links: {
      html: {
        href: "https://bitbucket.org/acme/demo/pull-requests/3",
      },
    },
    source: {
      branch: { name: "feature" },
      commit: { hash: sha },
    },
    title: "Demo",
  });

test("createPullRequestReview posts inline Bitbucket comments", async () => {
  let captured: HttpClientRequest.HttpClientRequest | undefined;
  let metadataGets = 0;

  const FakeHttpLive = Layer.succeed(
    HttpClient.HttpClient,
    makeRecordingHttpClient((request) => {
      if (request.method === "GET" && request.url.endsWith("/pullrequests/3")) {
        metadataGets += 1;
        return pullRequestMetadataResponse(headSha);
      }

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

  const review = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs.createPullRequestReview(pullRequestRef, headSha, [
      {
        body: "Looks good.",
        line: 9,
        path: "src/app.ts",
        side: "RIGHT",
      },
    ]);
  }).pipe(
    Effect.provide(provideBitbucket(FakeHttpLive)),
    Effect.provide(
      bitbucketAuthConfig({
        BITBUCKET_EMAIL: "dev@example.com",
        BITBUCKET_TOKEN: "test-token",
      })
    ),
    Effect.runPromise
  );

  strictEqual(metadataGets, 1);
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
});

test("createPullRequestReview requires Bitbucket authentication", async () => {
  const FakeHttpLive = Layer.succeed(
    HttpClient.HttpClient,
    makeRecordingHttpClient(() => new Response("unused", { status: 500 }))
  );

  const error = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs
      .createPullRequestReview(pullRequestRef, headSha, [
        {
          body: "comment",
          line: 1,
          path: "a.ts",
          side: "RIGHT",
        },
      ])
      .pipe(Effect.flip);
  }).pipe(
    Effect.provide(provideBitbucket(FakeHttpLive)),
    Effect.provide(bitbucketAuthConfig({})),
    Effect.runPromise
  );

  strictEqual(error._tag, "VcsError");
  strictEqual(error.reason, "AuthenticationRequired");
  match(error.message, /authentication is required to comment/iu);
});

test("createPullRequestReview does not retry transient mutation failures", async () => {
  let commentPosts = 0;

  const FakeHttpLive = Layer.succeed(
    HttpClient.HttpClient,
    makeRecordingHttpClient((request) => {
      if (request.method === "GET" && request.url.endsWith("/pullrequests/3")) {
        return pullRequestMetadataResponse(headSha);
      }

      if (request.method === "POST") {
        commentPosts += 1;
        return new Response("temporary failure", { status: 500 });
      }

      return new Response("unused", { status: 404 });
    })
  );

  const error = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs
      .createPullRequestReview(pullRequestRef, headSha, [
        {
          body: "Looks good.",
          line: 9,
          path: "src/app.ts",
          side: "RIGHT",
        },
      ])
      .pipe(Effect.flip);
  }).pipe(
    Effect.provide(provideBitbucket(FakeHttpLive)),
    Effect.provide(
      bitbucketAuthConfig({
        BITBUCKET_EMAIL: "dev@example.com",
        BITBUCKET_TOKEN: "test-token",
      })
    ),
    Effect.runPromise
  );

  strictEqual(commentPosts, 1);
  strictEqual(error._tag, "VcsError");
  strictEqual(error.reason, "HttpError");
});

test("createPullRequestReview fails when the pull request head moved", async () => {
  let commentPosts = 0;

  const FakeHttpLive = Layer.succeed(
    HttpClient.HttpClient,
    makeRecordingHttpClient((request) => {
      if (request.method === "GET" && request.url.endsWith("/pullrequests/3")) {
        return pullRequestMetadataResponse(
          "abcdef0123456789abcdef0123456789abcdef01"
        );
      }

      if (request.method === "POST") {
        commentPosts += 1;
      }

      return new Response("unused", { status: 500 });
    })
  );

  const error = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs
      .createPullRequestReview(pullRequestRef, headSha, [
        {
          body: "Looks good.",
          line: 9,
          path: "src/app.ts",
          side: "RIGHT",
        },
      ])
      .pipe(Effect.flip);
  }).pipe(
    Effect.provide(provideBitbucket(FakeHttpLive)),
    Effect.provide(
      bitbucketAuthConfig({
        BITBUCKET_EMAIL: "dev@example.com",
        BITBUCKET_TOKEN: "test-token",
      })
    ),
    Effect.runPromise
  );

  strictEqual(commentPosts, 0);
  strictEqual(error._tag, "VcsError");
  strictEqual(error.reason, "Unsupported");
  match(error.message, /head moved/iu);
});

test("listPullRequestReviewThreads includes nested Bitbucket replies", async () => {
  const FakeHttpLive = Layer.succeed(
    HttpClient.HttpClient,
    makeRecordingHttpClient((request) => {
      if (!request.url.includes("/comments")) {
        return new Response("unused", { status: 404 });
      }

      return Response.json({
        values: [
          {
            content: { raw: "root" },
            created_on: "2026-08-10T00:00:00.000000+00:00",
            id: 1,
            inline: { from: null, path: "src/app.ts", to: 4 },
            user: { nickname: "dev" },
          },
          {
            content: { raw: "reply" },
            created_on: "2026-08-10T00:01:00.000000+00:00",
            id: 2,
            parent: { id: 1 },
            user: { nickname: "dev" },
          },
          {
            content: { raw: "nested" },
            created_on: "2026-08-10T00:02:00.000000+00:00",
            id: 3,
            parent: { id: 2 },
            user: { nickname: "dev" },
          },
        ],
      });
    })
  );

  const threads = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs.listPullRequestReviewThreads(pullRequestRef);
  }).pipe(
    Effect.provide(provideBitbucket(FakeHttpLive)),
    Effect.provide(
      bitbucketAuthConfig({
        BITBUCKET_EMAIL: "dev@example.com",
        BITBUCKET_TOKEN: "test-token",
      })
    ),
    Effect.runPromise
  );

  strictEqual(threads.length, 1);
  deepStrictEqual(
    threads[0]?.comments.map((comment) => comment.body),
    ["root", "reply", "nested"]
  );
});

test("listPullRequestReviewThreads treats empty Bitbucket resolution objects as resolved", async () => {
  const FakeHttpLive = Layer.succeed(
    HttpClient.HttpClient,
    makeRecordingHttpClient((request) => {
      if (!request.url.includes("/comments")) {
        return new Response("unused", { status: 404 });
      }

      return Response.json({
        values: [
          {
            content: { raw: "already resolved on Bitbucket" },
            created_on: "2026-08-10T00:00:00.000000+00:00",
            id: 11,
            inline: { from: null, path: "src/app.ts", to: 4 },
            // List endpoint returns an empty object instead of the full
            // resolution payload that the detail endpoint includes.
            resolution: {},
            user: { nickname: "dev" },
          },
        ],
      });
    })
  );

  const threads = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs.listPullRequestReviewThreads(pullRequestRef);
  }).pipe(
    Effect.provide(provideBitbucket(FakeHttpLive)),
    Effect.provide(
      bitbucketAuthConfig({
        BITBUCKET_EMAIL: "dev@example.com",
        BITBUCKET_TOKEN: "test-token",
      })
    ),
    Effect.runPromise
  );

  strictEqual(threads.length, 1);
  strictEqual(threads[0]?.isResolved, true);
});

test("setPullRequestReviewThreadResolved treats already-resolved Bitbucket threads as success", async () => {
  let resolvePosts = 0;

  const FakeHttpLive = Layer.succeed(
    HttpClient.HttpClient,
    makeRecordingHttpClient((request) => {
      if (request.method === "POST" && request.url.endsWith("/resolve")) {
        resolvePosts += 1;
        return Response.json(
          {
            error: { message: "Comment has already been resolved." },
            type: "error",
          },
          { status: 409 }
        );
      }

      return new Response("unused", { status: 404 });
    })
  );

  const result = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs.setPullRequestReviewThreadResolved(
      pullRequestRef,
      "11",
      true
    );
  }).pipe(
    Effect.provide(provideBitbucket(FakeHttpLive)),
    Effect.provide(
      bitbucketAuthConfig({
        BITBUCKET_EMAIL: "dev@example.com",
        BITBUCKET_TOKEN: "test-token",
      })
    ),
    Effect.runPromise
  );

  strictEqual(resolvePosts, 1);
  strictEqual(result.isResolved, true);
});

test("setPullRequestReviewThreadResolved treats already-open Bitbucket threads as success", async () => {
  let resolveDeletes = 0;

  const FakeHttpLive = Layer.succeed(
    HttpClient.HttpClient,
    makeRecordingHttpClient((request) => {
      if (request.method === "DELETE" && request.url.endsWith("/resolve")) {
        resolveDeletes += 1;
        return Response.json(
          {
            error: {
              message:
                "No PullRequestCommentResolution matches the given query.",
            },
            type: "error",
          },
          { status: 404 }
        );
      }

      return new Response("unused", { status: 500 });
    })
  );

  const result = await Effect.gen(function* () {
    const vcs = yield* VCSService;
    return yield* vcs.setPullRequestReviewThreadResolved(
      pullRequestRef,
      "11",
      false
    );
  }).pipe(
    Effect.provide(provideBitbucket(FakeHttpLive)),
    Effect.provide(
      bitbucketAuthConfig({
        BITBUCKET_EMAIL: "dev@example.com",
        BITBUCKET_TOKEN: "test-token",
      })
    ),
    Effect.runPromise
  );

  strictEqual(resolveDeletes, 1);
  strictEqual(result.isResolved, false);
});
