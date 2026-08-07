import { createServer } from "node:net";

import { Data, Effect, Result } from "effect";
import { ServeError } from "effect/unstable/http/HttpServerError";

export class ListenPortError extends Data.TaggedError("ListenPortError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface AvailableListenPort {
  readonly hosts: readonly string[];
  readonly port: number;
}

export interface FindAvailableListenPortOptions {
  readonly hosts: readonly string[];
  readonly maxAttempts?: number;
  readonly startPort: number;
}

const defaultMaxAttempts = 100;

export const isAddressInUse = (cause: unknown) =>
  typeof cause === "object" &&
  cause !== null &&
  "code" in cause &&
  cause.code === "EADDRINUSE";

export const isUnsupportedListenAddress = (cause: unknown) =>
  typeof cause === "object" &&
  cause !== null &&
  "code" in cause &&
  (cause.code === "EAFNOSUPPORT" ||
    cause.code === "EPROTONOSUPPORT" ||
    cause.code === "ENOTSUP" ||
    cause.code === "EADDRNOTAVAIL");

export const isServeAddressInUse = (error: unknown) =>
  error instanceof ServeError && isAddressInUse(error.cause);

type ListenProbeResult = "available" | "busy" | "unsupported";

const probeListenPort = Effect.fn(
  "lazydiff/services/listen-port/probeListenPort"
)((host: string, port: number) =>
  Effect.callback<ListenProbeResult, ListenPortError>((resume, signal) => {
    const server = createServer();

    const onAbort = () => {
      server.close();
    };

    const finish = (
      effect: Effect.Effect<ListenProbeResult, ListenPortError>
    ) => {
      signal.removeEventListener("abort", onAbort);
      resume(effect);
    };

    signal.addEventListener("abort", onAbort, { once: true });

    server.once("error", (cause) => {
      if (isAddressInUse(cause)) {
        finish(Effect.succeed("busy"));
        return;
      }

      if (isUnsupportedListenAddress(cause)) {
        finish(Effect.succeed("unsupported"));
        return;
      }

      finish(
        Effect.fail(
          new ListenPortError({
            cause,
            message: `Unable to check listen port ${port} on ${host}`,
          })
        )
      );
    });

    server.listen({ host, port }, () => {
      server.close((cause) => {
        if (cause) {
          finish(
            Effect.fail(
              new ListenPortError({
                cause,
                message: `Unable to release probe listener on port ${port}`,
              })
            )
          );
          return;
        }

        finish(Effect.succeed("available"));
      });
    });
  })
);

export const findAvailableListenPort = Effect.fn(
  "lazydiff/services/listen-port/findAvailableListenPort"
)(function* ({
  hosts,
  maxAttempts = defaultMaxAttempts,
  startPort,
}: FindAvailableListenPortOptions) {
  if (
    hosts.length === 0 ||
    !Number.isInteger(startPort) ||
    startPort < 1 ||
    startPort > 65_535 ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1
  ) {
    return yield* Effect.fail(
      new ListenPortError({
        message:
          "LAZYDIFF_PORT must be an integer between 1 and 65535 with at least one listen host",
      })
    );
  }

  const lastPort = Math.min(startPort + maxAttempts - 1, 65_535);
  let supportedHosts = hosts;

  for (let port = startPort; port <= lastPort; port += 1) {
    const nextSupportedHosts: string[] = [];
    let busy = false;

    for (const host of supportedHosts) {
      const result = yield* probeListenPort(host, port);

      if (result === "busy") {
        busy = true;
        break;
      }

      if (result === "available") {
        nextSupportedHosts.push(host);
      }
    }

    if (busy) {
      continue;
    }

    if (nextSupportedHosts.length === 0) {
      return yield* Effect.fail(
        new ListenPortError({
          message: `No supported listen address among ${hosts.join(", ")}`,
        })
      );
    }

    supportedHosts = nextSupportedHosts;
    return { hosts: supportedHosts, port } satisfies AvailableListenPort;
  }

  return yield* Effect.fail(
    new ListenPortError({
      message: `No available listen port between ${startPort} and ${lastPort} on ${supportedHosts.join(", ")}`,
    })
  );
});

/**
 * Selects a free port, then runs `use`. If the real bind loses a race with
 * another listener (`EADDRINUSE`), advances and tries again.
 */
export const withAvailableListenPort = <A, E, R>(
  options: FindAvailableListenPortOptions,
  use: (allocation: AvailableListenPort) => Effect.Effect<A, E, R>
): Effect.Effect<A, E | ListenPortError, R> =>
  Effect.gen(function* () {
    const maxAttempts = options.maxAttempts ?? defaultMaxAttempts;
    const lastPort = Math.min(options.startPort + maxAttempts - 1, 65_535);
    let { startPort } = options;

    while (startPort <= lastPort) {
      const allocation = yield* findAvailableListenPort({
        hosts: options.hosts,
        maxAttempts: lastPort - startPort + 1,
        startPort,
      });
      const outcome = yield* use(allocation).pipe(Effect.result);

      if (Result.isSuccess(outcome)) {
        return outcome.success;
      }

      if (isServeAddressInUse(outcome.failure) && allocation.port < lastPort) {
        startPort = allocation.port + 1;
        continue;
      }

      if (isServeAddressInUse(outcome.failure)) {
        return yield* Effect.fail(
          new ListenPortError({
            cause: outcome.failure,
            message: `No available listen port between ${options.startPort} and ${lastPort} on ${options.hosts.join(", ")}`,
          })
        );
      }

      return yield* Effect.fail(outcome.failure);
    }

    return yield* Effect.fail(
      new ListenPortError({
        message: `No available listen port between ${options.startPort} and ${lastPort} on ${options.hosts.join(", ")}`,
      })
    );
  });
