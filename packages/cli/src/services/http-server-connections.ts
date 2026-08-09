import type { Server } from "node:http";
import type { Socket } from "node:net";

import { Context, Effect, Layer } from "effect";

const make = Effect.acquireRelease(
  Effect.sync(() => {
    const registrations = new Map<Server, (socket: Socket) => void>();
    const sockets = new Set<Socket>();
    const closeConnections = () => {
      for (const socket of sockets) {
        socket.destroy();
      }
    };
    const register = Effect.fn(
      "lazydiff/services/httpServerConnections/register"
    )((server: Server) =>
      Effect.sync(() => {
        const onConnection = (socket: Socket) => {
          sockets.add(socket);
          socket.once("close", () => sockets.delete(socket));
        };

        registrations.set(server, onConnection);
        server.on("connection", onConnection);
      })
    );

    process.prependListener("SIGINT", closeConnections);
    process.prependListener("SIGTERM", closeConnections);

    return { closeConnections, register, registrations };
  }),
  ({ closeConnections, registrations }) =>
    Effect.sync(() => {
      process.removeListener("SIGINT", closeConnections);
      process.removeListener("SIGTERM", closeConnections);
      closeConnections();

      for (const [server, onConnection] of registrations) {
        server.off("connection", onConnection);
      }
    })
).pipe(Effect.map(({ register }) => ({ register })));

type HttpServerConnectionsShape = Effect.Success<typeof make>;

export const HttpServerConnections =
  Context.Service<HttpServerConnectionsShape>(
    "lazydiff/services/httpServerConnections"
  );

export const HttpServerConnectionsLive = Layer.effect(
  HttpServerConnections,
  make
);
