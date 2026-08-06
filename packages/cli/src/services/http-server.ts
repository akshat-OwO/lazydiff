import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { NodeHttpServer } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import {
  HttpRouter,
  HttpServerError,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
  HttpStaticServer,
} from "effect/unstable/http";

import { makeRpcRoutes } from "@/routes/rpc";

const webRoot = fileURLToPath(
  new URL("../../../../apps/web/dist/", import.meta.url)
);

const webIndex = fileURLToPath(
  new URL("../../../../apps/web/dist/index.html", import.meta.url)
);

const acceptsHtml = (request: HttpServerRequest.HttpServerRequest) =>
  request.headers.accept?.toLowerCase().includes("text/html") === true;

/**
 * Serves the built web UI. Diff routes carry the reviewed file path, so the
 * document fallback also has to answer requests whose path looks like a file
 * (`/src/index.ts`); `HttpStaticServer` only falls back for extensionless
 * paths. Non-document requests keep their 404 so missing assets stay visible.
 */
const WebRoutesLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const serveStatic = yield* HttpStaticServer.make({ root: webRoot });
    const handler = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;

      return yield* serveStatic.pipe(
        Effect.catchIf(
          (error) =>
            error.reason._tag === "RouteNotFound" && acceptsHtml(request),
          () =>
            HttpServerResponse.file(webIndex, {
              headers: { "Content-Type": "text/html; charset=utf-8" },
            }).pipe(
              Effect.mapError(
                (cause) =>
                  new HttpServerError.HttpServerError({
                    reason: new HttpServerError.InternalError({
                      cause,
                      request,
                    }),
                  })
              )
            )
        )
      );
    }).pipe(
      Effect.matchEffect({
        onFailure: HttpServerRespondable.toResponse,
        onSuccess: Effect.succeed,
      })
    );

    yield* router.add("GET", "/*", handler);
  })
);

export interface HttpServerOptions {
  readonly allowedOrigin: string;
  readonly host: string;
  readonly port: number;
  readonly serveWebUi: boolean;
}

export const makeHttpServerLayer = ({
  allowedOrigin,
  host,
  port,
  serveWebUi,
}: HttpServerOptions) => {
  const RoutesLive = Layer.merge(
    makeRpcRoutes({ allowedOrigin }),
    serveWebUi ? WebRoutesLive : Layer.empty
  );

  return HttpRouter.serve(RoutesLive).pipe(
    Layer.provide(
      NodeHttpServer.layer(createServer, {
        host,
        port,
      })
    )
  );
};
