import {
  GitChangedFilesError,
  GitDiffError,
  GitStatusError,
  LazyDiffRpcs,
} from "@lazydiff/protocol";
import { Effect, Layer, Stream } from "effect";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

import { Git } from "@/services/git";

const toGitChangedFilesError = (error: Error) =>
  new GitChangedFilesError({
    message: error.message || "Unable to read changed files",
  });

const toGitDiffError = (error: Error) =>
  new GitDiffError({
    message: error.message || "Unable to read the diff",
  });

const toGitStatusError = (error: Error) =>
  new GitStatusError({
    message: error.message || "Unable to read Git status",
  });

const GitRpcHandlersLive = LazyDiffRpcs.toLayer(
  Effect.gen(function* () {
    const git = yield* Git;

    return {
      "git.branch.subscribe": () =>
        git.branchChanges.pipe(
          Stream.map((head) => ({
            data: { head },
            type: "git.branch.changed" as const,
          }))
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
          data: { name: git.repositoryName },
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
