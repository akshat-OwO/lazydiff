import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { NodeHttpServer } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpRouter, HttpStaticServer } from "effect/unstable/http";

const webRoot = fileURLToPath(
  new URL("../../../../apps/web/dist/", import.meta.url)
);

export interface HttpServerOptions {
  readonly host: string;
  readonly port: number;
  readonly serveWebUi: boolean;
}

export const makeHttpServerLayer = ({
  host,
  port,
  serveWebUi,
}: HttpServerOptions) => {
  const RoutesLive = serveWebUi
    ? HttpStaticServer.layer({
        root: webRoot,
        spa: true,
      })
    : Layer.empty;

  return HttpRouter.serve(RoutesLive).pipe(
    Layer.provide(
      NodeHttpServer.layer(createServer, {
        host,
        port,
      })
    )
  );
};
