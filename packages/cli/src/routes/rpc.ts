import {
  GitBranchError,
  GitChangedFilesError,
  GitDiffError,
  GitStatusError,
  GithubPrAnnotationsError,
  LazyDiffRpcs,
} from "@lazydiff/protocol";
import { Effect, Layer, Option, Stream } from "effect";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

import { Git } from "@/services/git";
import { PullRequestSession } from "@/services/pull-request-session";
import { VCSService } from "@/services/vcs";

const toGitChangedFilesError = (error: Error) =>
  new GitChangedFilesError({
    message: error.message || "Unable to read changed files",
  });

const toGitBranchError = (error: Error) =>
  new GitBranchError({
    message: error.message || "Unable to update the Git branch",
  });

const toGitDiffError = (error: Error) =>
  new GitDiffError({
    message: error.message || "Unable to read the diff",
  });

const toGitStatusError = (error: Error) =>
  new GitStatusError({
    message: error.message || "Unable to read Git status",
  });

const toGithubPrAnnotationsError = (error: Error) =>
  new GithubPrAnnotationsError({
    message: error.message || "Unable to send annotations to the pull request",
  });

const GitRpcHandlersLive = LazyDiffRpcs.toLayer(
  Effect.gen(function* () {
    const git = yield* Git;
    const pullRequestSession = yield* PullRequestSession;
    const vcs = yield* VCSService;

    return {
      "git.branch.create": ({ data }) =>
        git.createBranch(data.name).pipe(
          Effect.map((head) => ({
            data: { head },
            type: "git.branch.created" as const,
          })),
          Effect.mapError(toGitBranchError)
        ),
      "git.branch.delete": ({ data }) =>
        git
          .deleteBranch(data)
          .pipe(
            Effect.as({ data: {}, type: "git.branch.deleted" as const }),
            Effect.mapError(toGitBranchError)
          ),
      "git.branch.subscribe": () =>
        git.branchChanges.pipe(
          Stream.map((head) => ({
            data: { head },
            type: "git.branch.changed" as const,
          }))
        ),
      "git.branch.switch": ({ data }) =>
        git.switchBranch(data.name).pipe(
          Effect.map((head) => ({
            data: { head },
            type: "git.branch.switched" as const,
          })),
          Effect.mapError(toGitBranchError)
        ),
      "git.branches.get": () =>
        git.listBranches().pipe(
          Effect.map((branches) => ({
            data: { branches },
            type: "git.branches.result" as const,
          })),
          Effect.mapError(toGitBranchError)
        ),
      "git.changed-files.get": ({ data }) =>
        git.changedFiles(data.scope, data.branch).pipe(
          Effect.map((files) => ({
            data: { files },
            type: "git.changed-files.result" as const,
          })),
          Effect.mapError(toGitChangedFilesError)
        ),
      "git.diff.subscribe": ({ data }) =>
        Stream.merge(
          Stream.make("initial" as const),
          git.repositoryChanges
        ).pipe(
          Stream.mapEffect(() => git.scopeDiff(data.scope, data.branch)),
          Stream.map((patch) => ({
            data: { patch },
            type: "git.diff.result" as const,
          })),
          Stream.mapError(toGitDiffError)
        ),
      "git.repository.get": () =>
        Effect.succeed({
          data: {
            name: git.repositoryName,
            source: git.reviewSource,
          },
          type: "git.repository.result" as const,
        }),
      "git.status.get": ({ data }) =>
        git.fileStatuses(data.scope, data.branch).pipe(
          Effect.map((entries) => ({
            data: { entries },
            type: "git.status.result" as const,
          })),
          Effect.mapError(toGitStatusError)
        ),
      "git.status.subscribe": ({ data }) =>
        Stream.merge(
          Stream.make("initial" as const),
          git.repositoryChanges
        ).pipe(
          Stream.mapEffect(() => git.fileStatuses(data.scope, data.branch)),
          Stream.map((entries) => ({
            data: { entries },
            type: "git.status.result" as const,
          })),
          Stream.mapError(toGitStatusError)
        ),
      "github.pr.annotations.post": ({ data }) =>
        Effect.gen(function* () {
          const review = yield* Option.match(pullRequestSession.review, {
            onNone: () =>
              Effect.fail(
                new GithubPrAnnotationsError({
                  message:
                    "Sending annotations is only available while reviewing a pull request with --pr.",
                })
              ),
            onSome: Effect.succeed,
          });

          const comment = yield* vcs
            .createPullRequestIssueComment(
              {
                host: "github.com",
                number: review.number,
                owner: review.owner,
                repo: review.repo,
              },
              data.body
            )
            .pipe(Effect.mapError(toGithubPrAnnotationsError));

          return {
            data: { htmlUrl: comment.htmlUrl },
            type: "github.pr.annotations.posted" as const,
          };
        }),
    };
  })
);

const makeOriginMiddleware = (allowedOrigins: ReadonlySet<string>) =>
  HttpRouter.middleware(
    Effect.succeed((httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const { origin } = request.headers;

        return origin !== undefined && allowedOrigins.has(origin)
          ? yield* httpEffect
          : HttpServerResponse.empty({ status: 403 });
      })
    )
  ).layer;

export interface RpcRoutesOptions {
  readonly allowedOrigins: ReadonlySet<string>;
}

export const makeRpcRoutes = ({ allowedOrigins }: RpcRoutesOptions) =>
  RpcServer.layerHttp({
    group: LazyDiffRpcs,
    path: "/ws",
  }).pipe(
    Layer.provide(GitRpcHandlersLive),
    Layer.provide(RpcSerialization.layerJson),
    Layer.provide(makeOriginMiddleware(allowedOrigins))
  );
