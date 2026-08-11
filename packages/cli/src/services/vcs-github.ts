import type {
  GithubPrReviewComment,
  GithubPrReviewCommentInput,
  GithubPrReviewThread,
  GitFileStatus,
  GitStatusEntry,
} from "@lazydiff/protocol";
import { Effect, Layer, Option, Schedule, Schema, Stream } from "effect";
import type { Redacted } from "effect";
import type { HttpClientResponse } from "effect/unstable/http";
import { Headers, HttpClient, HttpClientRequest } from "effect/unstable/http";

import { diffBatchSize } from "@/lib/diff-batches";
import { buildUnifiedPatchFromGithubFiles } from "@/lib/github-pull-request-patch";
import {
  formatGithubPullRequestUrl,
  parseGithubPullRequestUrl,
} from "@/lib/github-pull-request-url";
import { GithubAuth } from "@/services/github-auth";
import { VCSService, VcsError } from "@/services/vcs";
import type {
  PullRequestFileBatch,
  PullRequestRef,
  PullRequestSession,
} from "@/services/vcs";

const githubApiVersion = "2022-11-28";
const githubApiBaseUrl = "https://api.github.com";
const githubGraphqlUrl = "https://api.github.com/graphql";
const userAgent = "lazydiff";
const githubFilesPerPage = 100;
const maxThreadPages = 20;

const GithubPullRequest = Schema.Struct({
  base: Schema.Struct({
    ref: Schema.String,
  }),
  head: Schema.Struct({
    ref: Schema.String,
    sha: Schema.String,
  }),
  number: Schema.Number,
  title: Schema.String,
});

const GithubPullRequestFileStatus = Schema.Literals([
  "added",
  "removed",
  "modified",
  "renamed",
  "copied",
  "changed",
  "unchanged",
]);

const GithubPullRequestFile = Schema.Struct({
  filename: Schema.String,
  patch: Schema.optionalKey(Schema.String),
  previous_filename: Schema.optionalKey(Schema.String),
  status: GithubPullRequestFileStatus,
});

const GithubPullRequestFiles = Schema.Array(GithubPullRequestFile);

const GithubPullRequestReview = Schema.Struct({
  html_url: Schema.String,
});

const GithubPullRequestReviewComment = Schema.Struct({
  body: Schema.String,
  created_at: Schema.String,
  id: Schema.Number,
  node_id: Schema.String,
  user: Schema.Struct({
    login: Schema.String,
  }),
});

const GithubGraphqlReviewComment = Schema.Struct({
  author: Schema.NullOr(
    Schema.Struct({
      login: Schema.String,
    })
  ),
  body: Schema.String,
  createdAt: Schema.String,
  databaseId: Schema.Number,
  id: Schema.String,
  replyTo: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
    })
  ),
});

const GithubGraphqlReviewThread = Schema.Struct({
  comments: Schema.Struct({
    nodes: Schema.Array(GithubGraphqlReviewComment),
  }),
  diffSide: Schema.Literals(["LEFT", "RIGHT"]),
  id: Schema.String,
  isOutdated: Schema.Boolean,
  isResolved: Schema.Boolean,
  line: Schema.NullOr(Schema.Number),
  path: Schema.String,
  startLine: Schema.NullOr(Schema.Number),
});

const GithubGraphqlReviewThreadsPage = Schema.Struct({
  data: Schema.Struct({
    repository: Schema.NullOr(
      Schema.Struct({
        pullRequest: Schema.NullOr(
          Schema.Struct({
            reviewThreads: Schema.Struct({
              nodes: Schema.Array(GithubGraphqlReviewThread),
              pageInfo: Schema.Struct({
                endCursor: Schema.NullOr(Schema.String),
                hasNextPage: Schema.Boolean,
              }),
            }),
          })
        ),
      })
    ),
  }),
  errors: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        message: Schema.String,
      })
    )
  ),
});

const GithubGraphqlResolveThread = Schema.Struct({
  data: Schema.NullOr(
    Schema.Struct({
      resolveReviewThread: Schema.optionalKey(
        Schema.Struct({
          thread: Schema.Struct({
            id: Schema.String,
            isResolved: Schema.Boolean,
          }),
        })
      ),
      unresolveReviewThread: Schema.optionalKey(
        Schema.Struct({
          thread: Schema.Struct({
            id: Schema.String,
            isResolved: Schema.Boolean,
          }),
        })
      ),
    })
  ),
  errors: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        message: Schema.String,
      })
    )
  ),
});

const decodePullRequest = Schema.decodeEffect(
  Schema.toCodecJson(GithubPullRequest)
);
const decodePullRequestFiles = Schema.decodeEffect(
  Schema.toCodecJson(GithubPullRequestFiles)
);
const decodePullRequestReview = Schema.decodeEffect(
  Schema.toCodecJson(GithubPullRequestReview)
);
const decodePullRequestReviewComment = Schema.decodeEffect(
  Schema.toCodecJson(GithubPullRequestReviewComment)
);
const decodeGraphqlReviewThreadsPage = Schema.decodeEffect(
  Schema.toCodecJson(GithubGraphqlReviewThreadsPage)
);
const decodeGraphqlResolveThread = Schema.decodeEffect(
  Schema.toCodecJson(GithubGraphqlResolveThread)
);

const authenticationHelp =
  "Authenticate with `gh auth login`, or set the GITHUB_TOKEN environment variable.";

const reviewThreadsQuery = `query($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 50, after: $cursor) {
        pageInfo {
          endCursor
          hasNextPage
        }
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          diffSide
          comments(first: 50) {
            nodes {
              id
              databaseId
              body
              createdAt
              author {
                login
              }
              replyTo {
                id
              }
            }
          }
        }
      }
    }
  }
}`;

const resolveThreadMutation = `mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) {
    thread {
      id
      isResolved
    }
  }
}`;

const unresolveThreadMutation = `mutation($threadId: ID!) {
  unresolveReviewThread(input: { threadId: $threadId }) {
    thread {
      id
      isResolved
    }
  }
}`;

const toGitFileStatus = (
  status: typeof GithubPullRequestFileStatus.Type
): GitFileStatus | undefined => {
  switch (status) {
    case "added":
    case "copied": {
      return "added";
    }
    case "removed": {
      return "deleted";
    }
    case "renamed": {
      return "renamed";
    }
    case "modified":
    case "changed": {
      return "modified";
    }
    case "unchanged": {
      return undefined;
    }
    default: {
      return undefined;
    }
  }
};

const nextLinkPattern = /^\s*<(?<url>[^>]+)>\s*;\s*rel="next"\s*$/iu;

const nextLinkUrl = (linkHeader: Option.Option<string>): string | undefined => {
  if (Option.isNone(linkHeader)) {
    return undefined;
  }

  for (const part of linkHeader.value.split(",")) {
    const match = nextLinkPattern.exec(part);
    const url = match?.groups?.url;

    if (url !== undefined) {
      return url;
    }
  }

  return undefined;
};

const sortStatusEntries = (entries: readonly GitStatusEntry[]) =>
  [...entries].toSorted((left, right) => left.path.localeCompare(right.path));

const mapGithubFiles = (
  files: readonly (typeof GithubPullRequestFile.Type)[]
): GitStatusEntry[] =>
  sortStatusEntries(
    files.flatMap((file) => {
      const status = toGitFileStatus(file.status);

      if (status === undefined) {
        return [];
      }

      return [{ path: file.filename, status }];
    })
  );

const mapGraphqlComment = (
  comment: typeof GithubGraphqlReviewComment.Type
): GithubPrReviewComment => ({
  authorLogin: comment.author?.login ?? "ghost",
  body: comment.body,
  createdAt: comment.createdAt,
  databaseId: comment.databaseId,
  id: comment.id,
});

const mapGraphqlThread = (
  thread: typeof GithubGraphqlReviewThread.Type
): GithubPrReviewThread | undefined => {
  const [firstComment, ...restComments] = thread.comments.nodes;

  if (firstComment === undefined) {
    return undefined;
  }

  return {
    comments: [
      mapGraphqlComment(firstComment),
      ...restComments.map(mapGraphqlComment),
    ],
    id: thread.id,
    isOutdated: thread.isOutdated,
    isResolved: thread.isResolved,
    line: thread.line,
    path: thread.path,
    side: thread.diffSide,
    startLine: thread.startLine,
  };
};

const makeAuthedClient = (
  baseClient: HttpClient.HttpClient,
  token: Option.Option<Redacted.Redacted<string>>
) => {
  const withDefaults = HttpClient.mapRequest(
    baseClient,
    HttpClientRequest.setHeaders({
      "User-Agent": userAgent,
      "X-GitHub-Api-Version": githubApiVersion,
    })
  );

  return Option.match(token, {
    onNone: () => withDefaults,
    onSome: (value) =>
      HttpClient.mapRequest(withDefaults, HttpClientRequest.bearerToken(value)),
  }).pipe(
    HttpClient.retryTransient({
      schedule: Schedule.exponential("100 millis"),
      times: 2,
    })
  );
};

const responseError = (
  response: HttpClientResponse.HttpClientResponse,
  hasToken: boolean,
  ref: PullRequestRef,
  action: "fetch" | "comment" = "fetch"
) => {
  const pullRequestUrl = formatGithubPullRequestUrl(ref);
  const actionVerb = action === "comment" ? "comment on" : "fetch";

  if (response.status === 401 || response.status === 403) {
    return new VcsError({
      message: hasToken
        ? `GitHub rejected credentials while trying to ${actionVerb} ${pullRequestUrl}. ${authenticationHelp}`
        : `GitHub authentication is required to ${actionVerb} ${pullRequestUrl}. ${authenticationHelp}`,
      reason: "AuthenticationRequired",
    });
  }

  if (response.status === 404) {
    return new VcsError({
      message: hasToken
        ? `Pull request not found: ${pullRequestUrl}. Confirm the URL is correct and that your GitHub credentials can access the repository.`
        : `Pull request not found: ${pullRequestUrl}. If this is a private repository, ${authenticationHelp}`,
      reason: hasToken ? "NotFound" : "AuthenticationRequired",
    });
  }

  if (response.status === 406) {
    return new VcsError({
      message: `The diff for ${pullRequestUrl} is too large for the GitHub API to return.`,
      reason: "Unsupported",
    });
  }

  return new VcsError({
    message: `GitHub API request failed with status ${response.status} for ${pullRequestUrl}`,
    reason: "HttpError",
  });
};

const getOkResponse = (
  client: HttpClient.HttpClient,
  hasToken: boolean,
  ref: PullRequestRef,
  url: string,
  options?: HttpClientRequest.Options.NoUrl
) =>
  Effect.gen(function* () {
    const response = yield* client.get(url, options).pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to reach GitHub for ${formatGithubPullRequestUrl(ref)}: ${error.message}`,
            reason: "HttpError",
          })
      )
    );

    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(responseError(response, hasToken, ref));
    }

    return response;
  });

const executeOkResponse = (
  client: HttpClient.HttpClient,
  hasToken: boolean,
  ref: PullRequestRef,
  request: HttpClientRequest.HttpClientRequest,
  action: "fetch" | "comment"
) =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to reach GitHub for ${formatGithubPullRequestUrl(ref)}: ${error.message}`,
            reason: "HttpError",
          })
      )
    );

    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(responseError(response, hasToken, ref, action));
    }

    return response;
  });

const postJson = (
  client: HttpClient.HttpClient,
  hasToken: boolean,
  ref: PullRequestRef,
  url: string,
  body: unknown,
  action: "fetch" | "comment"
) =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(url, {
      accept: "application/vnd.github+json",
    }).pipe(
      HttpClientRequest.bodyJson(body),
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to encode GitHub request for ${formatGithubPullRequestUrl(ref)}: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );

    return yield* executeOkResponse(client, hasToken, ref, request, action);
  });

const requireToken = (
  token: Option.Option<Redacted.Redacted<string>>,
  ref: PullRequestRef,
  actionVerb: string
) => {
  if (Option.isNone(token)) {
    return Effect.fail(
      new VcsError({
        message: `GitHub authentication is required to ${actionVerb} ${formatGithubPullRequestUrl(ref)}. ${authenticationHelp}`,
        reason: "AuthenticationRequired",
      })
    );
  }

  return Effect.succeed(token);
};

const fetchPullRequestMetadata = (
  client: HttpClient.HttpClient,
  hasToken: boolean,
  ref: PullRequestRef
) =>
  Effect.gen(function* () {
    const response = yield* getOkResponse(
      client,
      hasToken,
      ref,
      `${githubApiBaseUrl}/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`,
      { accept: "application/vnd.github+json" }
    );
    const json = yield* response.json.pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to read GitHub pull request metadata: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );

    return yield* decodePullRequest(json).pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to decode GitHub pull request metadata: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );
  });

const fetchPullRequestFilePage = (
  client: HttpClient.HttpClient,
  hasToken: boolean,
  ref: PullRequestRef,
  pageUrl: string
) =>
  Effect.gen(function* () {
    const response = yield* getOkResponse(client, hasToken, ref, pageUrl, {
      accept: "application/vnd.github+json",
    });
    const json = yield* response.json.pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to read GitHub pull request files: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );
    const files = yield* decodePullRequestFiles(json).pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to decode GitHub pull request files: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );

    return {
      files,
      nextPageUrl: nextLinkUrl(Headers.get(response.headers, "link")),
    };
  });

/**
 * Streams every changed file, one page request at a time, so review can start
 * before the whole pull request has been downloaded.
 */
const pullRequestFileStream = (
  client: HttpClient.HttpClient,
  hasToken: boolean,
  ref: PullRequestRef,
  pageUrl: string
): Stream.Stream<typeof GithubPullRequestFile.Type, VcsError> =>
  Stream.unwrap(
    fetchPullRequestFilePage(client, hasToken, ref, pageUrl).pipe(
      Effect.map(({ files, nextPageUrl }) => {
        const page = Stream.fromIterable(files);

        return nextPageUrl === undefined
          ? page
          : Stream.concat(
              page,
              Stream.suspend(() =>
                pullRequestFileStream(client, hasToken, ref, nextPageUrl)
              )
            );
      })
    )
  );

const make = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const githubAuth = yield* GithubAuth;

  const openPullRequest = Effect.fn(
    "lazydiff/services/vcsGithub/openPullRequest"
  )(function* (url: string) {
    const ref = yield* parseGithubPullRequestUrl(url).pipe(
      Option.match({
        onNone: () =>
          Effect.fail(
            new VcsError({
              message: `Unsupported pull request URL: ${url}. Expected a GitHub URL like https://github.com/owner/repo/pull/123.`,
              reason: "InvalidPullRequestUrl",
            })
          ),
        onSome: Effect.succeed,
      })
    );
    const token = yield* githubAuth.resolveToken();
    const client = makeAuthedClient(httpClient, token);
    const hasToken = Option.isSome(token);
    const metadata = yield* fetchPullRequestMetadata(client, hasToken, ref);
    const fileBatches = pullRequestFileStream(
      client,
      hasToken,
      ref,
      `${githubApiBaseUrl}/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=${githubFilesPerPage}`
    ).pipe(
      Stream.grouped(diffBatchSize),
      Stream.map(
        (files): PullRequestFileBatch => ({
          entries: mapGithubFiles(files),
          patch: buildUnifiedPatchFromGithubFiles(files),
        })
      )
    );

    if (metadata.head.sha.trim().length === 0) {
      return yield* Effect.fail(
        new VcsError({
          message: `GitHub pull request ${formatGithubPullRequestUrl(ref)} did not include a head commit SHA.`,
          reason: "DecodeError",
        })
      );
    }

    const session: PullRequestSession = {
      baseRefName: metadata.base.ref,
      fileBatches,
      headRefName: metadata.head.ref,
      headSha: metadata.head.sha,
      number: metadata.number,
      owner: ref.owner,
      repo: ref.repo,
      title: metadata.title,
      url: formatGithubPullRequestUrl(ref),
    };

    return session;
  });

  const createPullRequestReview = Effect.fn(
    "lazydiff/services/vcsGithub/createPullRequestReview"
  )(function* (
    ref: PullRequestRef,
    commitId: string,
    comments: readonly GithubPrReviewCommentInput[]
  ) {
    const pullRequestUrl = formatGithubPullRequestUrl(ref);
    const token = yield* githubAuth.resolveToken();
    yield* requireToken(token, ref, "comment on");
    const client = makeAuthedClient(httpClient, token);
    const response = yield* postJson(
      client,
      true,
      ref,
      `${githubApiBaseUrl}/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/reviews`,
      {
        comments: comments.map((comment) => ({
          body: comment.body,
          line: comment.line,
          path: comment.path,
          side: comment.side,
          ...(comment.startLine === undefined
            ? {}
            : { start_line: comment.startLine }),
          ...(comment.startSide === undefined
            ? {}
            : { start_side: comment.startSide }),
        })),
        commit_id: commitId,
        event: "COMMENT",
      },
      "comment"
    );
    const json = yield* response.json.pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to read GitHub review response for ${pullRequestUrl}: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );
    const review = yield* decodePullRequestReview(json).pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to decode GitHub review response for ${pullRequestUrl}: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );

    return { htmlUrl: review.html_url };
  });

  const fetchReviewThreadsPage = (
    client: HttpClient.HttpClient,
    ref: PullRequestRef,
    cursor: string | null
  ): Effect.Effect<
    {
      readonly hasNextPage: boolean;
      readonly nextCursor: string | null;
      readonly threads: readonly GithubPrReviewThread[];
    },
    VcsError
  > =>
    Effect.gen(function* () {
      const pullRequestUrl = formatGithubPullRequestUrl(ref);
      const response = yield* postJson(
        client,
        true,
        ref,
        githubGraphqlUrl,
        {
          query: reviewThreadsQuery,
          variables: {
            cursor,
            name: ref.repo,
            number: ref.number,
            owner: ref.owner,
          },
        },
        "fetch"
      );
      const json = yield* response.json.pipe(
        Effect.mapError(
          (error) =>
            new VcsError({
              message: `Unable to read GitHub review threads for ${pullRequestUrl}: ${error.message}`,
              reason: "DecodeError",
            })
        )
      );
      const decoded = yield* decodeGraphqlReviewThreadsPage(json).pipe(
        Effect.mapError(
          (error) =>
            new VcsError({
              message: `Unable to decode GitHub review threads for ${pullRequestUrl}: ${error.message}`,
              reason: "DecodeError",
            })
        )
      );

      if (decoded.errors !== undefined && decoded.errors.length > 0) {
        return yield* Effect.fail(
          new VcsError({
            message: `GitHub GraphQL error while loading review threads for ${pullRequestUrl}: ${decoded.errors[0]?.message ?? "unknown error"}`,
            reason: "HttpError",
          })
        );
      }

      const pullRequest = decoded.data.repository?.pullRequest;

      if (pullRequest === undefined || pullRequest === null) {
        return yield* Effect.fail(
          new VcsError({
            message: `Pull request not found: ${pullRequestUrl}. Confirm the URL is correct and that your GitHub credentials can access the repository.`,
            reason: "NotFound",
          })
        );
      }

      return {
        hasNextPage: pullRequest.reviewThreads.pageInfo.hasNextPage,
        nextCursor: pullRequest.reviewThreads.pageInfo.endCursor,
        threads: pullRequest.reviewThreads.nodes.flatMap((thread) => {
          const mapped = mapGraphqlThread(thread);
          return mapped === undefined ? [] : [mapped];
        }),
      };
    });

  const listPullRequestReviewThreads = Effect.fn(
    "lazydiff/services/vcsGithub/listPullRequestReviewThreads"
  )(function* (ref: PullRequestRef) {
    const pullRequestUrl = formatGithubPullRequestUrl(ref);
    const token = yield* githubAuth.resolveToken();
    yield* requireToken(token, ref, "read review comments on");
    const client = makeAuthedClient(httpClient, token);
    const threads: GithubPrReviewThread[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < maxThreadPages; page += 1) {
      const pageResult: {
        readonly hasNextPage: boolean;
        readonly nextCursor: string | null;
        readonly threads: readonly GithubPrReviewThread[];
      } = yield* fetchReviewThreadsPage(client, ref, cursor);
      threads.push(...pageResult.threads);

      if (!pageResult.hasNextPage) {
        return threads;
      }

      cursor = pageResult.nextCursor;
    }

    return yield* Effect.fail(
      new VcsError({
        message: `Pull request ${pullRequestUrl} has too many review threads to load.`,
        reason: "Unsupported",
      })
    );
  });

  const replyToPullRequestReviewComment = Effect.fn(
    "lazydiff/services/vcsGithub/replyToPullRequestReviewComment"
  )(function* (ref: PullRequestRef, commentId: number, body: string) {
    const pullRequestUrl = formatGithubPullRequestUrl(ref);
    const token = yield* githubAuth.resolveToken();
    yield* requireToken(token, ref, "reply on");
    const client = makeAuthedClient(httpClient, token);
    const response = yield* postJson(
      client,
      true,
      ref,
      `${githubApiBaseUrl}/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/comments/${commentId}/replies`,
      { body },
      "comment"
    );
    const json = yield* response.json.pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to read GitHub reply response for ${pullRequestUrl}: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );
    const comment = yield* decodePullRequestReviewComment(json).pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to decode GitHub reply response for ${pullRequestUrl}: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );

    return {
      authorLogin: comment.user.login,
      body: comment.body,
      createdAt: comment.created_at,
      databaseId: comment.id,
      id: comment.node_id,
    };
  });

  const setPullRequestReviewThreadResolved = Effect.fn(
    "lazydiff/services/vcsGithub/setPullRequestReviewThreadResolved"
  )(function* (ref: PullRequestRef, threadId: string, resolved: boolean) {
    const pullRequestUrl = formatGithubPullRequestUrl(ref);
    const token = yield* githubAuth.resolveToken();
    yield* requireToken(token, ref, "update review threads on");
    const client = makeAuthedClient(httpClient, token);
    const response = yield* postJson(
      client,
      true,
      ref,
      githubGraphqlUrl,
      {
        query: resolved ? resolveThreadMutation : unresolveThreadMutation,
        variables: { threadId },
      },
      "comment"
    );
    const json = yield* response.json.pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to read GitHub resolve response for ${pullRequestUrl}: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );
    const decoded = yield* decodeGraphqlResolveThread(json).pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to decode GitHub resolve response for ${pullRequestUrl}: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );

    if (decoded.errors !== undefined && decoded.errors.length > 0) {
      return yield* Effect.fail(
        new VcsError({
          message: `GitHub GraphQL error while updating a review thread on ${pullRequestUrl}: ${decoded.errors[0]?.message ?? "unknown error"}`,
          reason: "HttpError",
        })
      );
    }

    const thread =
      decoded.data?.resolveReviewThread?.thread ??
      decoded.data?.unresolveReviewThread?.thread;

    if (thread === undefined) {
      return yield* Effect.fail(
        new VcsError({
          message: `GitHub did not return the updated review thread for ${pullRequestUrl}.`,
          reason: "DecodeError",
        })
      );
    }

    return { isResolved: thread.isResolved };
  });

  return {
    createPullRequestReview,
    listPullRequestReviewThreads,
    openPullRequest,
    replyToPullRequestReviewComment,
    setPullRequestReviewThreadResolved,
  };
});

export const GithubLive = Layer.effect(VCSService, make);
