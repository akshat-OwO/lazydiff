import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { NodeHttpServer } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpStaticServer } from "effect/unstable/http";

import { makeRpcRoutes } from "@/routes/rpc";
import { HttpServerConnections } from "@/services/http-server-connections";

const webRoot = fileURLToPath(new URL("web/", import.meta.url));

export interface HttpServerOptions {
  readonly allowedOrigins: ReadonlySet<string>;
  readonly host: string;
  readonly port: number;
  readonly serveWebUi: boolean;
  readonly showHttpLogs: boolean;
}

export const makeHttpServerLayer = ({
  allowedOrigins,
  host,
  port,
  serveWebUi,
  showHttpLogs,
}: HttpServerOptions) => {
  const WebRoutesLive = serveWebUi
    ? HttpStaticServer.layer({
        root: webRoot,
        spa: true,
      })
    : Layer.empty;

  const RoutesLive = Layer.merge(
    makeRpcRoutes({ allowedOrigins }),
    WebRoutesLive
  );

  const ServerLive = Layer.unwrap(
    Effect.gen(function* () {
      const connections = yield* HttpServerConnections;
      const server = createServer();
      yield* connections.register(server);

      return NodeHttpServer.layer(() => server, {
        host,
        port,
      });
    })
  );

  return HttpRouter.serve(RoutesLive, {
    disableListenLog: !showHttpLogs,
    disableLogger: !showHttpLogs,
  }).pipe(Layer.provide(ServerLive));
};
