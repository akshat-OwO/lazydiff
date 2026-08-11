import { match, ok, strictEqual } from "node:assert";
import { test } from "node:test";

import { NodeServices } from "@effect/platform-node";
import { Effect, Layer, Option } from "effect";
import type { HttpClientRequest } from "effect/unstable/http";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

import { GithubAuth, GithubAuthLive } from "../../src/services/github-auth.ts";
import { GithubLive } from "../../src/services/vcs-github.ts";
import { VCSService } from "../../src/services/vcs.ts";
import type { PullRequestRef } from "../../src/services/vcs.ts";

const GithubAuthTestLive = GithubAuthLive.pipe(
  Layer.provide(NodeServices.layer)
);

const GithubAuthNoneLive = Layer.succeed(GithubAuth, {
  resolveToken: Effect.fn("test/githubAuth/none")(() =>
    Effect.succeed(Option.none())
  ),
});

const pullRequestRef: PullRequestRef = {
  host: "github.com",
  number: 3,
  owner: "akshat-OwO",
  repo: "contingency",
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

test("createPullRequestReview posts inline line comments", async () => {
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
            "https://github.com/akshat-OwO/contingency/pull/3#pullrequestreview-1",
        },
        { status: 200 }
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
            path: "apps/web/src/components/navbar.tsx",
            side: "LEFT",
          },
        ]
      );
    }).pipe(
      Effect.provide(
        GithubLive.pipe(
          Layer.provide(GithubAuthTestLive),
          Layer.provide(FakeHttpLive),
          Layer.provide(NodeServices.layer)
        )
      ),
      Effect.runPromise
    );

    strictEqual(
      review.htmlUrl,
      "https://github.com/akshat-OwO/contingency/pull/3#pullrequestreview-1"
    );
    strictEqual(captured?.method, "POST");
    strictEqual(
      captured?.url,
      "https://api.github.com/repos/akshat-OwO/contingency/pulls/3/reviews"
    );

    const body = decodeRequestBody(captured);
    ok(body !== undefined && typeof body === "object");
    const record = body as {
      comments: readonly {
        body: string;
        line: number;
        path: string;
        side: string;
      }[];
      commit_id: string;
      event: string;
    };
    strictEqual(record.event, "COMMENT");
    strictEqual(record.commit_id, "0123456789abcdef0123456789abcdef01234567");
    strictEqual(record.comments.length, 1);
    strictEqual(record.comments[0]?.side, "LEFT");
    strictEqual(record.comments[0]?.line, 9);
    strictEqual(record.comments[0]?.body, "Looks good.");
  } finally {
    if (previous === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previous;
    }
  }
});

test("createPullRequestReview requires authentication", async () => {
  const FakeHttpLive = Layer.succeed(
    HttpClient.HttpClient,
    makeRecordingHttpClient(() => new Response("unused", { status: 500 }))
  );

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
    Effect.provide(
      GithubLive.pipe(
        Layer.provide(GithubAuthNoneLive),
        Layer.provide(FakeHttpLive),
        Layer.provide(NodeServices.layer)
      )
    ),
    Effect.runPromise
  );

  strictEqual(error._tag, "VcsError");
  strictEqual(error.reason, "AuthenticationRequired");
  match(error.message, /authentication is required to comment/iu);
});

test("listPullRequestReviewThreads fails when nested comments are truncated", async () => {
  const previous = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "test-token";

  const FakeHttpLive = Layer.succeed(
    HttpClient.HttpClient,
    makeRecordingHttpClient(() =>
      Response.json(
        {
          data: {
            repository: {
              pullRequest: {
                reviewThreads: {
                  nodes: [
                    {
                      comments: {
                        nodes: [
                          {
                            author: { login: "akshat" },
                            body: "first",
                            createdAt: "2026-08-11T00:00:00Z",
                            databaseId: 1,
                            id: "COMMENT_1",
                            replyTo: null,
                          },
                        ],
                        pageInfo: {
                          endCursor: "cursor-1",
                          hasNextPage: true,
                        },
                      },
                      diffSide: "RIGHT",
                      id: "THREAD_1",
                      isOutdated: false,
                      isResolved: false,
                      line: 10,
                      path: "src/a.ts",
                      startLine: null,
                    },
                  ],
                  pageInfo: {
                    endCursor: null,
                    hasNextPage: false,
                  },
                },
              },
            },
          },
        },
        { status: 200 }
      )
    )
  );

  try {
    const error = await Effect.gen(function* () {
      const vcs = yield* VCSService;
      return yield* vcs
        .listPullRequestReviewThreads(pullRequestRef)
        .pipe(Effect.flip);
    }).pipe(
      Effect.provide(
        GithubLive.pipe(
          Layer.provide(GithubAuthTestLive),
          Layer.provide(FakeHttpLive),
          Layer.provide(NodeServices.layer)
        )
      ),
      Effect.runPromise
    );

    strictEqual(error._tag, "VcsError");
    strictEqual(error.reason, "Unsupported");
    match(error.message, /more than 50 comments/iu);
  } finally {
    if (previous === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previous;
    }
  }
});
