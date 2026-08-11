import type {
  GithubPrReviewComment,
  GithubPrReviewCommentInput,
  GithubPrReviewThread,
  GitFileStatus,
  GitStatusEntry,
} from "@lazydiff/protocol";
import { Effect, Layer, Option, Schedule, Schema, Stream } from "effect";
import type { HttpClientResponse } from "effect/unstable/http";
import { HttpClient, HttpClientRequest } from "effect/unstable/http";

import { buildBitbucketPullRequestFileBatches } from "@/lib/bitbucket-pull-request-batches";
import { assertBitbucketPullRequestDiffComplete } from "@/lib/bitbucket-pull-request-diff";
import type { BitbucketDiffstatFile } from "@/lib/bitbucket-pull-request-diff";
import { BitbucketAuth } from "@/services/bitbucket-auth";
import type { BitbucketCredentials } from "@/services/bitbucket-auth";
import {
  formatBitbucketPullRequestUrl,
  parseBitbucketPullRequestUrl,
} from "@/services/bitbucket-pull-request-url";
import { VCSService, VcsError } from "@/services/vcs";
import type {
  PullRequestFileBatch,
  PullRequestRef,
  PullRequestSession,
  VCSServiceShape,
} from "@/services/vcs";

const bitbucketApiBaseUrl = "https://api.bitbucket.org/2.0";
const userAgent = "lazydiff";
const maxDiffstatPages = 50;
const maxCommentPages = 50;

const BitbucketLink = Schema.Struct({
  href: Schema.String,
});

const BitbucketCommit = Schema.Struct({
  hash: Schema.String,
  links: Schema.optionalKey(
    Schema.Struct({
      self: Schema.optionalKey(BitbucketLink),
    })
  ),
});

const BitbucketBranch = Schema.Struct({
  name: Schema.String,
});

const BitbucketPullRequest = Schema.Struct({
  destination: Schema.Struct({
    branch: BitbucketBranch,
  }),
  id: Schema.Number,
  links: Schema.Struct({
    html: BitbucketLink,
  }),
  source: Schema.Struct({
    branch: BitbucketBranch,
    commit: BitbucketCommit,
  }),
  title: Schema.String,
});

const BitbucketCommitDetails = Schema.Struct({
  hash: Schema.String,
});

const BitbucketDiffstatPath = Schema.NullOr(
  Schema.Struct({
    path: Schema.String,
  })
);

const BitbucketDiffstatStatus = Schema.Literals([
  "added",
  "removed",
  "modified",
  "renamed",
  "merge conflict",
]);

const BitbucketDiffstat = Schema.Struct({
  lines_added: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  lines_removed: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  new: BitbucketDiffstatPath,
  old: BitbucketDiffstatPath,
  status: BitbucketDiffstatStatus,
});

const BitbucketPaginatedDiffstat = Schema.Struct({
  next: Schema.optionalKey(Schema.NullOr(Schema.String)),
  values: Schema.Array(BitbucketDiffstat),
});

const BitbucketCommentUser = Schema.NullOr(
  Schema.Struct({
    display_name: Schema.optionalKey(Schema.String),
    nickname: Schema.optionalKey(Schema.String),
  })
);

const BitbucketCommentInline = Schema.NullOr(
  Schema.Struct({
    from: Schema.NullOr(Schema.Number),
    outdated: Schema.optionalKey(Schema.NullOr(Schema.Boolean)),
    path: Schema.String,
    start_from: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    start_to: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    to: Schema.NullOr(Schema.Number),
  })
);

const BitbucketCommentResolution = Schema.NullOr(
  Schema.Struct({
    type: Schema.optionalKey(Schema.String),
  })
);

const BitbucketComment = Schema.Struct({
  content: Schema.Struct({
    raw: Schema.String,
  }),
  created_on: Schema.String,
  deleted: Schema.optionalKey(Schema.Boolean),
  id: Schema.Number,
  inline: Schema.optionalKey(BitbucketCommentInline),
  parent: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        id: Schema.Number,
      })
    )
  ),
  resolution: Schema.optionalKey(BitbucketCommentResolution),
  user: Schema.optionalKey(BitbucketCommentUser),
});

const BitbucketPaginatedComments = Schema.Struct({
  next: Schema.optionalKey(Schema.NullOr(Schema.String)),
  values: Schema.Array(BitbucketComment),
});

const BitbucketCreatedComment = Schema.Struct({
  content: Schema.Struct({
    raw: Schema.String,
  }),
  created_on: Schema.String,
  id: Schema.Number,
  links: Schema.optionalKey(
    Schema.Struct({
      html: Schema.optionalKey(BitbucketLink),
    })
  ),
  user: Schema.optionalKey(BitbucketCommentUser),
});

const BitbucketCommentResolutionResult = Schema.Struct({
  type: Schema.optionalKey(Schema.String),
});

const BitbucketCommentExistence = Schema.Struct({
  deleted: Schema.optionalKey(Schema.Boolean),
  id: Schema.Number,
});

const decodePullRequest = Schema.decodeEffect(
  Schema.toCodecJson(BitbucketPullRequest)
);
const decodeCommitDetails = Schema.decodeEffect(
  Schema.toCodecJson(BitbucketCommitDetails)
);
const decodePaginatedDiffstat = Schema.decodeEffect(
  Schema.toCodecJson(BitbucketPaginatedDiffstat)
);
const decodePaginatedComments = Schema.decodeEffect(
  Schema.toCodecJson(BitbucketPaginatedComments)
);
const decodeCreatedComment = Schema.decodeEffect(
  Schema.toCodecJson(BitbucketCreatedComment)
);
const decodeCommentResolution = Schema.decodeEffect(
  Schema.toCodecJson(BitbucketCommentResolutionResult)
);
const decodeCommentExistence = Schema.decodeEffect(
  Schema.toCodecJson(BitbucketCommentExistence)
);

const authenticationHelp =
  "Set BITBUCKET_TOKEN to a Bitbucket API token with pull request scopes. For API tokens, also set BITBUCKET_EMAIL to your Atlassian account email.";

const toGitFileStatus = (
  status: typeof BitbucketDiffstatStatus.Type
): GitFileStatus | undefined => {
  switch (status) {
    case "added": {
      return "added";
    }
    case "removed": {
      return "deleted";
    }
    case "renamed": {
      return "renamed";
    }
    case "modified": {
      return "modified";
    }
    case "merge conflict": {
      return "modified";
    }
    default: {
      return undefined;
    }
  }
};

const sortByPath = <A extends { readonly path: string }>(
  entries: readonly A[]
): A[] =>
  [...entries].toSorted((left, right) => left.path.localeCompare(right.path));

const mapDiffstat = (
  values: readonly (typeof BitbucketDiffstat.Type)[]
): BitbucketDiffstatFile[] =>
  sortByPath(
    values.flatMap((entry) => {
      const status = toGitFileStatus(entry.status);

      if (status === undefined) {
        return [];
      }

      const path = entry.new?.path ?? entry.old?.path;

      if (path === undefined) {
        return [];
      }

      return [
        {
          linesAdded: entry.lines_added ?? 0,
          linesRemoved: entry.lines_removed ?? 0,
          path,
          status,
        },
      ];
    })
  );

const toGitStatusEntries = (
  files: readonly BitbucketDiffstatFile[]
): GitStatusEntry[] =>
  files.map((file) => ({
    path: file.path,
    status: file.status,
  }));

const authorLoginOf = (
  user: typeof BitbucketCommentUser.Type | undefined
): string => {
  if (user === null || user === undefined) {
    return "ghost";
  }

  const nickname = user.nickname?.trim();
  if (nickname !== undefined && nickname.length > 0) {
    return nickname;
  }

  const displayName = user.display_name?.trim();
  if (displayName !== undefined && displayName.length > 0) {
    return displayName;
  }

  return "ghost";
};

/**
 * Bitbucket's comment list endpoint returns `resolution: {}` for resolved
 * threads (without `type`), while the detail endpoint includes the full
 * resolution object. Treat any non-null resolution as resolved.
 */
const isCommentResolved = (
  resolution: typeof BitbucketCommentResolution.Type | undefined
): boolean => resolution !== undefined && resolution !== null;

const inlineSideAndLine = (
  inline: NonNullable<typeof BitbucketCommentInline.Type>
):
  | {
      readonly line: number;
      readonly side: "LEFT" | "RIGHT";
      readonly startLine: number | null;
    }
  | undefined => {
  if (inline.to !== null) {
    return {
      line: inline.to,
      side: "RIGHT",
      startLine: inline.start_to ?? null,
    };
  }

  if (inline.from !== null) {
    return {
      line: inline.from,
      side: "LEFT",
      startLine: inline.start_from ?? null,
    };
  }

  return undefined;
};

const mapComment = (
  comment: typeof BitbucketComment.Type
): GithubPrReviewComment => ({
  authorLogin: authorLoginOf(comment.user),
  body: comment.content.raw,
  createdAt: comment.created_on,
  databaseId: comment.id,
  id: String(comment.id),
});

const makeAuthedClient = (
  baseClient: HttpClient.HttpClient,
  credentials: Option.Option<BitbucketCredentials>,
  options?: {
    readonly retryTransient?: boolean;
  }
) => {
  const withDefaults = HttpClient.mapRequest(
    baseClient,
    HttpClientRequest.setHeaders({
      Accept: "application/json",
      "User-Agent": userAgent,
    })
  );

  const authenticated = Option.match(credentials, {
    onNone: () => withDefaults,
    onSome: (value) =>
      HttpClient.mapRequest(withDefaults, (request) =>
        Option.match(value.email, {
          onNone: () => HttpClientRequest.bearerToken(request, value.token),
          onSome: (email) =>
            HttpClientRequest.basicAuth(request, email, value.token),
        })
      ),
  });

  // Mutations must not replay: a dropped 5xx/transport response can still have
  // created the comment on Bitbucket's side.
  if (options?.retryTransient === false) {
    return authenticated;
  }

  return authenticated.pipe(
    HttpClient.retryTransient({
      schedule: Schedule.exponential("100 millis"),
      times: 2,
    })
  );
};

const responseError = (
  response: HttpClientResponse.HttpClientResponse,
  hasCredentials: boolean,
  ref: PullRequestRef,
  action: "fetch" | "comment" = "fetch"
) => {
  const pullRequestUrl = formatBitbucketPullRequestUrl(ref);
  const actionVerb = action === "comment" ? "comment on" : "fetch";

  if (response.status === 401 || response.status === 403) {
    return new VcsError({
      message: hasCredentials
        ? `Bitbucket rejected credentials while trying to ${actionVerb} ${pullRequestUrl}. ${authenticationHelp}`
        : `Bitbucket authentication is required to ${actionVerb} ${pullRequestUrl}. ${authenticationHelp}`,
      reason: "AuthenticationRequired",
    });
  }

  if (response.status === 404) {
    return new VcsError({
      message: hasCredentials
        ? `Pull request not found: ${pullRequestUrl}. Confirm the URL is correct and that your Bitbucket credentials can access the repository.`
        : `Pull request not found: ${pullRequestUrl}. If this is a private repository, ${authenticationHelp}`,
      reason: hasCredentials ? "NotFound" : "AuthenticationRequired",
    });
  }

  return new VcsError({
    message: `Bitbucket API request failed with status ${response.status} for ${pullRequestUrl}`,
    reason: "HttpError",
  });
};

const getOkResponse = (
  client: HttpClient.HttpClient,
  hasCredentials: boolean,
  ref: PullRequestRef,
  url: string,
  options?: HttpClientRequest.Options.NoUrl
) =>
  Effect.gen(function* () {
    const response = yield* client.get(url, options).pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to reach Bitbucket for ${formatBitbucketPullRequestUrl(ref)}: ${error.message}`,
            reason: "HttpError",
          })
      )
    );

    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(responseError(response, hasCredentials, ref));
    }

    return response;
  });

const executeOkResponse = (
  client: HttpClient.HttpClient,
  hasCredentials: boolean,
  ref: PullRequestRef,
  request: HttpClientRequest.HttpClientRequest,
  action: "fetch" | "comment",
  options?: {
    readonly acceptStatuses?: ReadonlySet<number>;
  }
) =>
  Effect.gen(function* () {
    const response = yield* client.execute(request).pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to reach Bitbucket for ${formatBitbucketPullRequestUrl(ref)}: ${error.message}`,
            reason: "HttpError",
          })
      )
    );

    if (options?.acceptStatuses?.has(response.status) === true) {
      return response;
    }

    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(
        responseError(response, hasCredentials, ref, action)
      );
    }

    return response;
  });

const postJson = (
  client: HttpClient.HttpClient,
  hasCredentials: boolean,
  ref: PullRequestRef,
  url: string,
  body: unknown,
  action: "fetch" | "comment",
  options?: {
    readonly acceptStatuses?: ReadonlySet<number>;
  }
) =>
  Effect.gen(function* () {
    const request = yield* HttpClientRequest.post(url, {
      accept: "application/json",
    }).pipe(
      HttpClientRequest.bodyJson(body),
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to encode Bitbucket request for ${formatBitbucketPullRequestUrl(ref)}: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );

    return yield* executeOkResponse(
      client,
      hasCredentials,
      ref,
      request,
      action,
      options
    );
  });

const deleteOk = (
  client: HttpClient.HttpClient,
  hasCredentials: boolean,
  ref: PullRequestRef,
  url: string,
  action: "fetch" | "comment",
  options?: {
    readonly acceptStatuses?: ReadonlySet<number>;
  }
) =>
  Effect.gen(function* () {
    const request = HttpClientRequest.delete(url, {
      accept: "application/json",
    });

    return yield* executeOkResponse(
      client,
      hasCredentials,
      ref,
      request,
      action,
      options
    );
  });

const requireCredentials = (
  credentials: Option.Option<BitbucketCredentials>,
  ref: PullRequestRef,
  actionVerb: string
) => {
  if (Option.isNone(credentials)) {
    return Effect.fail(
      new VcsError({
        message: `Bitbucket authentication is required to ${actionVerb} ${formatBitbucketPullRequestUrl(ref)}. ${authenticationHelp}`,
        reason: "AuthenticationRequired",
      })
    );
  }

  return Effect.succeed(credentials);
};

const requireBitbucketRef = (ref: PullRequestRef) => {
  if (ref.host !== "bitbucket.org") {
    return Effect.fail(
      new VcsError({
        message: `Bitbucket VCS received a non-Bitbucket pull request ref for ${ref.owner}/${ref.repo}#${ref.number}.`,
        reason: "Unsupported",
      })
    );
  }

  return Effect.void;
};

const apiRepositoryPath = (ref: PullRequestRef) =>
  `${bitbucketApiBaseUrl}/repositories/${ref.owner}/${ref.repo}`;

const apiPullRequestPath = (ref: PullRequestRef) =>
  `${apiRepositoryPath(ref)}/pullrequests/${ref.number}`;

const fetchPullRequestMetadata = (
  client: HttpClient.HttpClient,
  hasCredentials: boolean,
  ref: PullRequestRef
) =>
  Effect.gen(function* () {
    const response = yield* getOkResponse(
      client,
      hasCredentials,
      ref,
      apiPullRequestPath(ref)
    );
    const json = yield* response.json.pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to read Bitbucket pull request metadata: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );

    return yield* decodePullRequest(json).pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to decode Bitbucket pull request metadata: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );
  });

const fetchFullCommitHash = (
  client: HttpClient.HttpClient,
  hasCredentials: boolean,
  ref: PullRequestRef,
  commit: typeof BitbucketCommit.Type
) =>
  Effect.gen(function* () {
    const trimmed = commit.hash.trim();

    if (/^[0-9a-f]{40}$/iu.test(trimmed)) {
      return trimmed;
    }

    const commitUrl =
      commit.links?.self?.href ??
      `${apiRepositoryPath(ref)}/commit/${encodeURIComponent(trimmed)}`;
    const response = yield* getOkResponse(
      client,
      hasCredentials,
      ref,
      commitUrl
    );
    const json = yield* response.json.pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to read Bitbucket commit metadata: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );
    const details = yield* decodeCommitDetails(json).pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to decode Bitbucket commit metadata: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );
    const fullHash = details.hash.trim();

    if (fullHash.length === 0) {
      return yield* Effect.fail(
        new VcsError({
          message: `Bitbucket pull request ${formatBitbucketPullRequestUrl(ref)} did not include a head commit SHA.`,
          reason: "DecodeError",
        })
      );
    }

    return fullHash;
  });

const fetchCurrentHeadSha = (
  client: HttpClient.HttpClient,
  hasCredentials: boolean,
  ref: PullRequestRef
) =>
  Effect.gen(function* () {
    const metadata = yield* fetchPullRequestMetadata(
      client,
      hasCredentials,
      ref
    );

    return yield* fetchFullCommitHash(
      client,
      hasCredentials,
      ref,
      metadata.source.commit
    );
  });

const requireMatchingHeadSha = (
  client: HttpClient.HttpClient,
  hasCredentials: boolean,
  ref: PullRequestRef,
  expectedHeadSha: string
) =>
  Effect.gen(function* () {
    const currentHeadSha = yield* fetchCurrentHeadSha(
      client,
      hasCredentials,
      ref
    );

    if (currentHeadSha.toLowerCase() === expectedHeadSha.toLowerCase()) {
      return currentHeadSha;
    }

    return yield* Effect.fail(
      new VcsError({
        message: `Pull request ${formatBitbucketPullRequestUrl(ref)} head moved from ${expectedHeadSha} to ${currentHeadSha}. Refresh the review to continue.`,
        reason: "Unsupported",
      })
    );
  });

const collectDescendantComments = (
  rootId: number,
  repliesByParent: ReadonlyMap<
    number,
    readonly (typeof BitbucketComment.Type)[]
  >
): (typeof BitbucketComment.Type)[] => {
  const collected: (typeof BitbucketComment.Type)[] = [];
  const pending = [...(repliesByParent.get(rootId) ?? [])];

  while (pending.length > 0) {
    const comment = pending.shift();

    if (comment === undefined) {
      break;
    }

    collected.push(comment);
    pending.push(...(repliesByParent.get(comment.id) ?? []));
  }

  return collected;
};

const fetchPullRequestDiffstat = (
  client: HttpClient.HttpClient,
  hasCredentials: boolean,
  ref: PullRequestRef
): Effect.Effect<(typeof BitbucketDiffstat.Type)[], VcsError> =>
  Effect.gen(function* () {
    const values: (typeof BitbucketDiffstat.Type)[] = [];
    let pageUrl: string | undefined =
      `${apiPullRequestPath(ref)}/diffstat?pagelen=100`;

    for (
      let page = 0;
      page < maxDiffstatPages && pageUrl !== undefined;
      page += 1
    ) {
      const response = yield* getOkResponse(
        client,
        hasCredentials,
        ref,
        pageUrl
      );
      const json = yield* response.json.pipe(
        Effect.mapError(
          (error: { readonly message: string }) =>
            new VcsError({
              message: `Unable to read Bitbucket pull request diffstat: ${error.message}`,
              reason: "DecodeError",
            })
        )
      );
      const pageResult: typeof BitbucketPaginatedDiffstat.Type =
        yield* decodePaginatedDiffstat(json).pipe(
          Effect.mapError(
            (error: { readonly message: string }) =>
              new VcsError({
                message: `Unable to decode Bitbucket pull request diffstat: ${error.message}`,
                reason: "DecodeError",
              })
          )
        );

      values.push(...pageResult.values);
      const nextPage = pageResult.next;
      pageUrl =
        nextPage === undefined || nextPage === null ? undefined : nextPage;
    }

    if (pageUrl !== undefined) {
      return yield* Effect.fail(
        new VcsError({
          message: `Pull request ${formatBitbucketPullRequestUrl(ref)} has too many changed files to load.`,
          reason: "Unsupported",
        })
      );
    }

    return values;
  });

const fetchPullRequestDiff = (
  client: HttpClient.HttpClient,
  hasCredentials: boolean,
  ref: PullRequestRef
) =>
  Effect.gen(function* () {
    const response = yield* getOkResponse(
      client,
      hasCredentials,
      ref,
      `${apiPullRequestPath(ref)}/diff`,
      { accept: "text/plain" }
    );

    return yield* response.text.pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to read Bitbucket pull request diff: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );
  });

const fetchAllComments = (
  client: HttpClient.HttpClient,
  hasCredentials: boolean,
  ref: PullRequestRef
): Effect.Effect<(typeof BitbucketComment.Type)[], VcsError> =>
  Effect.gen(function* () {
    const comments: (typeof BitbucketComment.Type)[] = [];
    let pageUrl: string | undefined =
      `${apiPullRequestPath(ref)}/comments?pagelen=100`;

    for (
      let page = 0;
      page < maxCommentPages && pageUrl !== undefined;
      page += 1
    ) {
      const response = yield* getOkResponse(
        client,
        hasCredentials,
        ref,
        pageUrl
      );
      const json = yield* response.json.pipe(
        Effect.mapError(
          (error: { readonly message: string }) =>
            new VcsError({
              message: `Unable to read Bitbucket pull request comments: ${error.message}`,
              reason: "DecodeError",
            })
        )
      );
      const pageResult: typeof BitbucketPaginatedComments.Type =
        yield* decodePaginatedComments(json).pipe(
          Effect.mapError(
            (error: { readonly message: string }) =>
              new VcsError({
                message: `Unable to decode Bitbucket pull request comments: ${error.message}`,
                reason: "DecodeError",
              })
          )
        );

      comments.push(...pageResult.values);
      const nextPage = pageResult.next;
      pageUrl =
        nextPage === undefined || nextPage === null ? undefined : nextPage;
    }

    if (pageUrl !== undefined) {
      return yield* Effect.fail(
        new VcsError({
          message: `Pull request ${formatBitbucketPullRequestUrl(ref)} has too many review comments to load.`,
          reason: "Unsupported",
        })
      );
    }

    return comments;
  });

const inlineBodyForComment = (comment: GithubPrReviewCommentInput) => {
  const inline: {
    from?: number;
    path: string;
    start_from?: number;
    start_to?: number;
    to?: number;
  } = {
    path: comment.path,
  };

  if (comment.side === "LEFT") {
    inline.from = comment.line;
    if (comment.startLine !== undefined) {
      inline.start_from = comment.startLine;
    }
  } else {
    inline.to = comment.line;
    if (comment.startLine !== undefined) {
      inline.start_to = comment.startLine;
    }
  }

  return {
    content: { raw: comment.body },
    inline,
  };
};

export const makeBitbucketVcs = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const bitbucketAuth = yield* BitbucketAuth;

  const openPullRequest = Effect.fn(
    "lazydiff/services/vcsBitbucket/openPullRequest"
  )(function* (url: string) {
    const ref = yield* parseBitbucketPullRequestUrl(url).pipe(
      Option.match({
        onNone: () =>
          Effect.fail(
            new VcsError({
              message: `Unsupported pull request URL: ${url}. Expected a Bitbucket URL like https://bitbucket.org/workspace/repo/pull-requests/123.`,
              reason: "InvalidPullRequestUrl",
            })
          ),
        onSome: Effect.succeed,
      })
    );
    const credentials = yield* bitbucketAuth.resolveCredentials();
    const client = makeAuthedClient(httpClient, credentials);
    const hasCredentials = Option.isSome(credentials);
    const metadata = yield* fetchPullRequestMetadata(
      client,
      hasCredentials,
      ref
    );
    const headSha = yield* fetchFullCommitHash(
      client,
      hasCredentials,
      ref,
      metadata.source.commit
    );
    const pullRequestUrl = formatBitbucketPullRequestUrl(ref);

    // Diffstat + unified patch load when the session stream is consumed so
    // review metadata can be served immediately. Re-check the PR head around
    // those unpinned requests so a push cannot mix revisions into one session.
    const fileBatches: Stream.Stream<PullRequestFileBatch, VcsError> =
      Stream.unwrap(
        Effect.gen(function* () {
          yield* requireMatchingHeadSha(client, hasCredentials, ref, headSha);

          const [diffstat, patch] = yield* Effect.all(
            [
              fetchPullRequestDiffstat(client, hasCredentials, ref),
              fetchPullRequestDiff(client, hasCredentials, ref),
            ],
            { concurrency: "unbounded" }
          );

          yield* requireMatchingHeadSha(client, hasCredentials, ref, headSha);

          const files = mapDiffstat(diffstat);
          yield* assertBitbucketPullRequestDiffComplete(
            files,
            patch,
            pullRequestUrl
          );

          return Stream.fromIterable(
            buildBitbucketPullRequestFileBatches(
              toGitStatusEntries(files),
              patch
            )
          );
        })
      );

    const session: PullRequestSession = {
      baseRefName: metadata.destination.branch.name,
      fileBatches,
      headRefName: metadata.source.branch.name,
      headSha,
      host: "bitbucket.org",
      number: metadata.id,
      owner: ref.owner,
      repo: ref.repo,
      title: metadata.title,
      url: pullRequestUrl,
    };

    return session;
  });

  const createPullRequestReview = Effect.fn(
    "lazydiff/services/vcsBitbucket/createPullRequestReview"
  )(function* (
    ref: PullRequestRef,
    commitId: string,
    comments: readonly GithubPrReviewCommentInput[]
  ) {
    yield* requireBitbucketRef(ref);
    const pullRequestUrl = formatBitbucketPullRequestUrl(ref);
    const credentials = yield* bitbucketAuth.resolveCredentials();
    yield* requireCredentials(credentials, ref, "comment on");
    const readClient = makeAuthedClient(httpClient, credentials);
    yield* requireMatchingHeadSha(readClient, true, ref, commitId);
    const mutationClient = makeAuthedClient(httpClient, credentials, {
      retryTransient: false,
    });
    let firstCommentHtmlUrl: string | undefined;

    for (const comment of comments) {
      const response = yield* postJson(
        mutationClient,
        true,
        ref,
        `${apiPullRequestPath(ref)}/comments`,
        inlineBodyForComment(comment),
        "comment"
      );
      const json = yield* response.json.pipe(
        Effect.mapError(
          (error) =>
            new VcsError({
              message: `Unable to read Bitbucket comment response for ${pullRequestUrl}: ${error.message}`,
              reason: "DecodeError",
            })
        )
      );
      const created = yield* decodeCreatedComment(json).pipe(
        Effect.mapError(
          (error) =>
            new VcsError({
              message: `Unable to decode Bitbucket comment response for ${pullRequestUrl}: ${error.message}`,
              reason: "DecodeError",
            })
        )
      );

      firstCommentHtmlUrl ??=
        created.links?.html?.href ??
        `${pullRequestUrl}/_/diff#comment-${created.id}`;
    }

    return {
      htmlUrl: firstCommentHtmlUrl ?? pullRequestUrl,
    };
  });

  const listPullRequestReviewThreads = Effect.fn(
    "lazydiff/services/vcsBitbucket/listPullRequestReviewThreads"
  )(function* (ref: PullRequestRef) {
    yield* requireBitbucketRef(ref);
    const credentials = yield* bitbucketAuth.resolveCredentials();
    yield* requireCredentials(credentials, ref, "read review comments on");
    const client = makeAuthedClient(httpClient, credentials);
    const comments = yield* fetchAllComments(client, true, ref);
    const activeComments = comments.filter(
      (comment) => comment.deleted !== true
    );
    const repliesByParent = new Map<number, (typeof BitbucketComment.Type)[]>();

    for (const comment of activeComments) {
      const parentId = comment.parent?.id;
      if (parentId === undefined || parentId === null) {
        continue;
      }

      const replies = repliesByParent.get(parentId) ?? [];
      replies.push(comment);
      repliesByParent.set(parentId, replies);
    }

    const threads: GithubPrReviewThread[] = [];

    for (const comment of activeComments) {
      if (comment.parent?.id !== undefined && comment.parent.id !== null) {
        continue;
      }

      if (comment.inline === undefined || comment.inline === null) {
        continue;
      }

      const location = inlineSideAndLine(comment.inline);
      if (location === undefined) {
        continue;
      }

      const replyComments = collectDescendantComments(
        comment.id,
        repliesByParent
      )
        .toSorted((left, right) =>
          left.created_on.localeCompare(right.created_on)
        )
        .map(mapComment);

      threads.push({
        comments: [mapComment(comment), ...replyComments],
        id: String(comment.id),
        isOutdated: comment.inline.outdated === true,
        isResolved: isCommentResolved(comment.resolution),
        line: location.line,
        path: comment.inline.path,
        side: location.side,
        startLine: location.startLine,
      });
    }

    return threads;
  });

  const replyToPullRequestReviewComment = Effect.fn(
    "lazydiff/services/vcsBitbucket/replyToPullRequestReviewComment"
  )(function* (ref: PullRequestRef, commentId: number, body: string) {
    yield* requireBitbucketRef(ref);
    const pullRequestUrl = formatBitbucketPullRequestUrl(ref);
    const credentials = yield* bitbucketAuth.resolveCredentials();
    yield* requireCredentials(credentials, ref, "reply on");
    const client = makeAuthedClient(httpClient, credentials, {
      retryTransient: false,
    });
    const response = yield* postJson(
      client,
      true,
      ref,
      `${apiPullRequestPath(ref)}/comments`,
      {
        content: { raw: body },
        parent: { id: commentId },
      },
      "comment"
    );
    const json = yield* response.json.pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to read Bitbucket reply response for ${pullRequestUrl}: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );
    const comment = yield* decodeCreatedComment(json).pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to decode Bitbucket reply response for ${pullRequestUrl}: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );

    return {
      authorLogin: authorLoginOf(comment.user),
      body: comment.content.raw,
      createdAt: comment.created_on,
      databaseId: comment.id,
      id: String(comment.id),
    };
  });

  const setPullRequestReviewThreadResolved = Effect.fn(
    "lazydiff/services/vcsBitbucket/setPullRequestReviewThreadResolved"
  )(function* (ref: PullRequestRef, threadId: string, resolved: boolean) {
    yield* requireBitbucketRef(ref);
    const pullRequestUrl = formatBitbucketPullRequestUrl(ref);
    const commentId = Number(threadId);

    if (!Number.isSafeInteger(commentId) || commentId <= 0) {
      return yield* Effect.fail(
        new VcsError({
          message: `Invalid Bitbucket review thread id "${threadId}" for ${pullRequestUrl}.`,
          reason: "DecodeError",
        })
      );
    }

    const credentials = yield* bitbucketAuth.resolveCredentials();
    yield* requireCredentials(credentials, ref, "update review threads on");
    const client = makeAuthedClient(httpClient, credentials, {
      retryTransient: false,
    });
    const resolveUrl = `${apiPullRequestPath(ref)}/comments/${commentId}/resolve`;

    if (resolved) {
      // 409 means the thread is already resolved on Bitbucket.
      const response = yield* postJson(
        client,
        true,
        ref,
        resolveUrl,
        {},
        "comment",
        { acceptStatuses: new Set([409]) }
      );

      if (response.status === 409) {
        return { isResolved: true };
      }

      const json = yield* response.json.pipe(
        Effect.mapError(
          (error) =>
            new VcsError({
              message: `Unable to read Bitbucket resolve response for ${pullRequestUrl}: ${error.message}`,
              reason: "DecodeError",
            })
        )
      );
      const resolution = yield* decodeCommentResolution(json).pipe(
        Effect.mapError(
          (error) =>
            new VcsError({
              message: `Unable to decode Bitbucket resolve response for ${pullRequestUrl}: ${error.message}`,
              reason: "DecodeError",
            })
        )
      );

      return {
        isResolved: isCommentResolved(resolution),
      };
    }

    // 404 can mean either "already open" or "comment does not exist". Confirm
    // an active (non-deleted) comment before treating this as idempotent success.
    const response = yield* deleteOk(client, true, ref, resolveUrl, "comment", {
      acceptStatuses: new Set([404]),
    });

    if (response.status === 404) {
      const detailResponse = yield* getOkResponse(
        client,
        true,
        ref,
        `${apiPullRequestPath(ref)}/comments/${commentId}`
      );
      const detailJson = yield* detailResponse.json.pipe(
        Effect.mapError(
          (error) =>
            new VcsError({
              message: `Unable to read Bitbucket comment ${commentId} for ${pullRequestUrl}: ${error.message}`,
              reason: "DecodeError",
            })
        )
      );
      const detail = yield* decodeCommentExistence(detailJson).pipe(
        Effect.mapError(
          (error) =>
            new VcsError({
              message: `Unable to decode Bitbucket comment ${commentId} for ${pullRequestUrl}: ${error.message}`,
              reason: "DecodeError",
            })
        )
      );

      if (detail.deleted === true) {
        return yield* Effect.fail(
          new VcsError({
            message: `Bitbucket comment ${commentId} was deleted on ${pullRequestUrl}.`,
            reason: "NotFound",
          })
        );
      }
    }

    return { isResolved: false };
  });

  return {
    createPullRequestReview,
    listPullRequestReviewThreads,
    openPullRequest,
    replyToPullRequestReviewComment,
    setPullRequestReviewThreadResolved,
  } satisfies VCSServiceShape;
});

export const BitbucketLive = Layer.effect(VCSService, makeBitbucketVcs);
