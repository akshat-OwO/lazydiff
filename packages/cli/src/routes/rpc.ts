import { LazyDiffRpcs } from "@lazydiff/protocol";
import { Effect, Layer, Stream } from "effect";
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";

import { Git } from "@/services/git";

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
    };
  })
);

const makeOriginMiddleware = (allowedOrigin: string) =>
  HttpRouter.middleware(
    Effect.succeed((httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;

        return request.headers.origin === allowedOrigin
          ? yield* httpEffect
          : HttpServerResponse.empty({ status: 403 });
      })
    )
  ).layer;

export interface RpcRoutesOptions {
  readonly allowedOrigin: string;
}

export const makeRpcRoutes = ({ allowedOrigin }: RpcRoutesOptions) =>
  RpcServer.layerHttp({
    group: LazyDiffRpcs,
    path: "/ws",
  }).pipe(
    Layer.provide(GitRpcHandlersLive),
    Layer.provide(RpcSerialization.layerJson),
    Layer.provide(makeOriginMiddleware(allowedOrigin))
  );
