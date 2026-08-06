import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { NodeHttpServer } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpRouter, HttpStaticServer } from "effect/unstable/http";

import { makeRpcRoutes } from "@/routes/rpc";

const webRoot = fileURLToPath(
  new URL("../../../../apps/web/dist/", import.meta.url)
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
  const WebRoutesLive = serveWebUi
    ? HttpStaticServer.layer({
        root: webRoot,
        spa: true,
      })
    : Layer.empty;

  const RoutesLive = Layer.merge(
    makeRpcRoutes({ allowedOrigin }),
    WebRoutesLive
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
