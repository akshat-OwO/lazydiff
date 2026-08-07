import { deepStrictEqual, strictEqual } from "node:assert";
import { createServer } from "node:net";
import type { Server } from "node:net";
import { test } from "node:test";

import { Effect } from "effect";
import { ServeError } from "effect/unstable/http/HttpServerError";

import {
  findAvailableListenPort,
  isUnsupportedListenAddress,
  ListenPortError,
  withAvailableListenPort,
} from "../../src/services/listen-port.ts";

const occupyPort = (host: string, port: number) =>
  Effect.acquireRelease(
    Effect.callback<Server, Error>((resume) => {
      const server = createServer();

      server.once("error", (cause) => {
        resume(Effect.fail(cause));
      });

      server.listen({ host, port }, () => {
        resume(Effect.succeed(server));
      });
    }),
    (server) =>
      Effect.callback((resume) => {
        server.close(() => {
          resume(Effect.void);
        });
      })
  );

const allocateEphemeralPort = (host: string) =>
  Effect.callback<number, Error>((resume) => {
    const server = createServer();

    server.once("error", (cause) => {
      resume(Effect.fail(cause));
    });

    server.listen({ host, port: 0 }, () => {
      const address = server.address();

      if (address === null || typeof address === "string") {
        server.close();
        resume(Effect.fail(new Error("Expected a TCP listen address")));
        return;
      }

      const { port } = address;

      server.close((cause) => {
        if (cause) {
          resume(Effect.fail(cause));
          return;
        }

        resume(Effect.succeed(port));
      });
    });
  });

test("findAvailableListenPort returns the preferred port when it is free", async () => {
  const result = await Effect.gen(function* () {
    const preferredPort = yield* allocateEphemeralPort("127.0.0.1");
    const available = yield* findAvailableListenPort({
      hosts: ["127.0.0.1"],
      startPort: preferredPort,
    });
    return { available, preferredPort };
  }).pipe(Effect.runPromise);

  strictEqual(result.available.port, result.preferredPort);
  deepStrictEqual(result.available.hosts, ["127.0.0.1"]);
});

test("findAvailableListenPort skips occupied ports", async () => {
  await Effect.scoped(
    Effect.gen(function* () {
      const preferredPort = yield* allocateEphemeralPort("127.0.0.1");
      yield* occupyPort("127.0.0.1", preferredPort);

      const available = yield* findAvailableListenPort({
        hosts: ["127.0.0.1"],
        startPort: preferredPort,
      });

      strictEqual(available.port, preferredPort + 1);
    })
  ).pipe(Effect.runPromise);
});

test("findAvailableListenPort fails when no port remains in range", async () => {
  await Effect.scoped(
    Effect.gen(function* () {
      const preferredPort = yield* allocateEphemeralPort("127.0.0.1");
      yield* occupyPort("127.0.0.1", preferredPort);

      const error = yield* findAvailableListenPort({
        hosts: ["127.0.0.1"],
        maxAttempts: 1,
        startPort: preferredPort,
      }).pipe(Effect.flip);

      strictEqual(error instanceof ListenPortError, true);
      strictEqual(
        error.message,
        `No available listen port between ${preferredPort} and ${preferredPort} on 127.0.0.1`
      );
    })
  ).pipe(Effect.runPromise);
});

test("unavailable IPv6 loopback is treated as an unsupported listen address", () => {
  strictEqual(
    isUnsupportedListenAddress(
      Object.assign(new Error("address not available"), {
        code: "EADDRNOTAVAIL",
      })
    ),
    true
  );
  strictEqual(
    isUnsupportedListenAddress(
      Object.assign(new Error("address in use"), { code: "EADDRINUSE" })
    ),
    false
  );
});

test("withAvailableListenPort retries after a bind-time EADDRINUSE race", async () => {
  const result = await Effect.gen(function* () {
    const preferredPort = yield* allocateEphemeralPort("127.0.0.1");
    let attempts = 0;

    const port = yield* withAvailableListenPort(
      {
        hosts: ["127.0.0.1"],
        maxAttempts: 5,
        startPort: preferredPort,
      },
      (allocation) => {
        attempts += 1;

        if (attempts === 1) {
          strictEqual(allocation.port, preferredPort);
          return Effect.fail(
            new ServeError({
              cause: Object.assign(new Error("listen EADDRINUSE"), {
                code: "EADDRINUSE",
              }),
            })
          );
        }

        return Effect.succeed(allocation.port);
      }
    );

    return { attempts, port, preferredPort };
  }).pipe(Effect.runPromise);

  strictEqual(result.attempts, 2);
  strictEqual(result.port, result.preferredPort + 1);
});
