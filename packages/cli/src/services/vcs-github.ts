import type { GitFileStatus, GitStatusEntry } from "@lazydiff/protocol";
import { Effect, Layer, Option, Schedule, Schema } from "effect";
import type { Redacted } from "effect";
import type { HttpClientResponse } from "effect/unstable/http";
import { Headers, HttpClient, HttpClientRequest } from "effect/unstable/http";

import { buildUnifiedPatchFromGithubFiles } from "@/lib/github-pull-request-patch";
import {
  formatGithubPullRequestUrl,
  parseGithubPullRequestUrl,
} from "@/lib/github-pull-request-url";
import { GithubAuth } from "@/services/github-auth";
import { VCSService, VcsError } from "@/services/vcs";
import type { PullRequestRef, PullRequestReview } from "@/services/vcs";

const githubApiVersion = "2022-11-28";
const githubApiBaseUrl = "https://api.github.com";
const userAgent = "lazydiff";
/** GitHub rejects the PR-level diff media type above this many files. */
const githubUnifiedDiffFileLimit = 300;

const GithubPullRequest = Schema.Struct({
  base: Schema.Struct({
    ref: Schema.String,
  }),
  head: Schema.Struct({
    ref: Schema.String,
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

const decodePullRequest = Schema.decodeEffect(
  Schema.toCodecJson(GithubPullRequest)
);
const decodePullRequestFiles = Schema.decodeEffect(
  Schema.toCodecJson(GithubPullRequestFiles)
);

const authenticationHelp =
  "Authenticate with `gh auth login`, or set the GITHUB_TOKEN environment variable.";

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
  ref: PullRequestRef
) => {
  const pullRequestUrl = formatGithubPullRequestUrl(ref);

  if (response.status === 401 || response.status === 403) {
    return new VcsError({
      message: hasToken
        ? `GitHub rejected credentials while fetching ${pullRequestUrl}. ${authenticationHelp}`
        : `GitHub authentication is required to fetch ${pullRequestUrl}. ${authenticationHelp}`,
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

const fetchPullRequestFiles = (
  client: HttpClient.HttpClient,
  hasToken: boolean,
  ref: PullRequestRef
) =>
  Effect.gen(function* () {
    const files: (typeof GithubPullRequestFile.Type)[] = [];
    let pageUrl: string | undefined =
      `${githubApiBaseUrl}/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}/files?per_page=100`;

    while (pageUrl !== undefined) {
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
      const pageFiles = yield* decodePullRequestFiles(json).pipe(
        Effect.mapError(
          (error) =>
            new VcsError({
              message: `Unable to decode GitHub pull request files: ${error.message}`,
              reason: "DecodeError",
            })
        )
      );

      files.push(...pageFiles);
      pageUrl = nextLinkUrl(Headers.get(response.headers, "link"));
    }

    return files;
  });

const fetchPullRequestDiff = (
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
      {
        accept: "application/vnd.github.diff",
      }
    );

    return yield* response.text.pipe(
      Effect.mapError(
        (error) =>
          new VcsError({
            message: `Unable to read GitHub pull request diff: ${error.message}`,
            reason: "DecodeError",
          })
      )
    );
  });

const resolvePullRequestPatch = (
  client: HttpClient.HttpClient,
  hasToken: boolean,
  ref: PullRequestRef,
  files: readonly (typeof GithubPullRequestFile.Type)[]
) => {
  if (files.length > githubUnifiedDiffFileLimit) {
    return Effect.succeed(buildUnifiedPatchFromGithubFiles(files));
  }

  return fetchPullRequestDiff(client, hasToken, ref).pipe(
    Effect.catchIf(
      (error) => error.reason === "Unsupported",
      () => Effect.succeed(buildUnifiedPatchFromGithubFiles(files))
    )
  );
};

const make = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const githubAuth = yield* GithubAuth;

  const fetchPullRequest = Effect.fn(
    "lazydiff/services/vcsGithub/fetchPullRequest"
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
    const [metadata, files] = yield* Effect.all(
      [
        fetchPullRequestMetadata(client, hasToken, ref),
        fetchPullRequestFiles(client, hasToken, ref),
      ],
      { concurrency: "unbounded" }
    );
    const patch = yield* resolvePullRequestPatch(client, hasToken, ref, files);

    const review: PullRequestReview = {
      baseRefName: metadata.base.ref,
      entries: mapGithubFiles(files),
      headRefName: metadata.head.ref,
      number: metadata.number,
      owner: ref.owner,
      patch,
      repo: ref.repo,
      title: metadata.title,
      url: formatGithubPullRequestUrl(ref),
    };

    return review;
  });

  return { fetchPullRequest };
});

export const GithubLive = Layer.effect(VCSService, make);
