import { createServer } from "node:http";

import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Console, Effect, Layer } from "effect";

import {
  HttpServerConnections,
  HttpServerConnectionsLive,
} from "../../src/services/http-server-connections.ts";

const program = Effect.scoped(
  Effect.gen(function* () {
    const connections = yield* HttpServerConnections;
    const server = createServer(() => {
      process.stdout.write("request-started\n");
    });

    yield* connections.register(server);
    yield* Layer.build(
      NodeHttpServer.layer(() => server, {
        host: "127.0.0.1",
        port: 0,
      })
    );

    const address = server.address();
    if (address === null || typeof address === "string") {
      return yield* Effect.die("HTTP server did not bind to a TCP port");
    }

    yield* Console.log(address.port);
    return yield* Effect.never;
  })
).pipe(Effect.provide(HttpServerConnectionsLive));

NodeRuntime.runMain(program);
