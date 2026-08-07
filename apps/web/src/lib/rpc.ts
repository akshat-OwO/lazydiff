import { LazyDiffRpcs } from "@lazydiff/protocol";
import type { GitChangeScope } from "@lazydiff/protocol";
import { Duration, Effect, Layer, Schedule, Stream } from "effect";
import { Atom, AtomRpc } from "effect/unstable/reactivity";
import {
  RpcClient,
  RpcClientError,
  RpcSerialization,
} from "effect/unstable/rpc";
import { Socket } from "effect/unstable/socket";

const webSocketUrl = Effect.sync(() => {
  const url = new URL("/ws", globalThis.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
});

const SocketLive = Socket.layerWebSocket(webSocketUrl).pipe(
  Layer.provide(Socket.layerWebSocketConstructorGlobal)
);

const RpcProtocolLive = RpcClient.layerProtocolSocket({
  retryTransientErrors: true,
}).pipe(Layer.provide(SocketLive), Layer.provide(RpcSerialization.layerJson));

const maximumRetryDelay = Duration.seconds(5);

const isTransientRpcError = (error: unknown) => {
  if (!(error instanceof RpcClientError.RpcClientError)) {
    return false;
  }

  switch (error.reason._tag) {
    case "SocketCloseError":
    case "SocketOpenError":
    case "SocketReadError":
    case "SocketWriteError": {
      return true;
    }
    default: {
      return false;
    }
  }
};

const rpcRetrySchedule = Schedule.exponential("100 millis").pipe(
  Schedule.jittered,
  Schedule.modifyDelay(({ duration }) =>
    Effect.succeed(Duration.min(duration, maximumRetryDelay))
  ),
  Schedule.while(({ input }) => isTransientRpcError(input))
);

export class LazyDiffRpcClient extends AtomRpc.Service<LazyDiffRpcClient>()(
  "lazydiff/web/LazyDiffRpcClient",
  {
    group: LazyDiffRpcs,
    protocol: RpcProtocolLive,
  }
) {}

export const gitChangeScopeAtom = Atom.make<GitChangeScope>("unstaged");

export const gitStatusAtom = LazyDiffRpcClient.runtime.atom((get) =>
  Stream.unwrap(
    Effect.gen(function* subscribeToGitStatus() {
      const client = yield* LazyDiffRpcClient;
      return client("git.status.subscribe", {
        data: { scope: get(gitChangeScopeAtom) },
        type: "git.status.subscribe",
      });
    })
  ).pipe(Stream.retry(rpcRetrySchedule))
);

export const gitDiffAtom = LazyDiffRpcClient.runtime.atom((get) =>
  Stream.unwrap(
    Effect.gen(function* subscribeToGitDiff() {
      const client = yield* LazyDiffRpcClient;
      return client("git.diff.subscribe", {
        data: { scope: get(gitChangeScopeAtom) },
        type: "git.diff.subscribe",
      });
    })
  ).pipe(Stream.retry(rpcRetrySchedule))
);

export const gitBranchChangesAtom = LazyDiffRpcClient.runtime.atom(
  Stream.unwrap(
    Effect.gen(function* gitBranchChangesAtom() {
      const client = yield* LazyDiffRpcClient;
      return client("git.branch.subscribe", {
        data: {},
        type: "git.branch.subscribe",
      });
    })
  ).pipe(Stream.retry(rpcRetrySchedule))
);
