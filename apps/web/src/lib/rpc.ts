import { LazyDiffRpcs } from "@lazydiff/protocol";
import type { GitChangeScope } from "@lazydiff/protocol";
import { Duration, Effect, Layer, Result, Schedule, Stream } from "effect";
import { Atom, AtomRpc } from "effect/unstable/reactivity";
import {
  RpcClient,
  RpcClientError,
  RpcSerialization,
} from "effect/unstable/rpc";
import { Socket } from "effect/unstable/socket";

import { annotationDraftAtom } from "@/lib/annotations";
import {
  gitChangeScopePreferenceOrder,
  resolvePreferredGitChangeScope,
} from "@/lib/git-change-scope";

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

/**
 * When the selected scope has no changes, switch to the first preferred scope
 * that does (unstaged → staged → committed).
 *
 * Pull request reviews only expose committed changes, so force that scope.
 */
export const gitChangeScopeAutoSelectAtom = LazyDiffRpcClient.runtime.atom(
  (get) =>
    Effect.gen(function* autoSelectGitChangeScope() {
      const repository = get(gitRepositoryAtom);

      if (
        repository._tag === "Success" &&
        repository.value.data.source === "pull-request"
      ) {
        if (get(gitChangeScopeAtom) !== "committed") {
          get.set(annotationDraftAtom, null);
          get.set(gitChangeScopeAtom, "committed");
        }

        return;
      }

      const status = get(gitStatusAtom);

      if (status._tag !== "Success" || status.value.data.entries.length > 0) {
        return;
      }

      const client = yield* LazyDiffRpcClient;
      const currentScope = get(gitChangeScopeAtom);
      const hasChanges: Partial<Record<GitChangeScope, boolean>> = {
        [currentScope]: false,
      };

      for (const scope of gitChangeScopePreferenceOrder) {
        if (scope in hasChanges) {
          continue;
        }

        const result = yield* client("git.status.get", {
          data: { scope },
          type: "git.status.get",
        }).pipe(Effect.result);

        // A failed lookup must not be treated as empty; stop so resolution
        // cannot fall through to a lower-priority scope.
        if (Result.isFailure(result)) {
          break;
        }

        hasChanges[scope] = result.success.data.entries.length > 0;

        if (hasChanges[scope]) {
          break;
        }
      }

      const preferred = resolvePreferredGitChangeScope(hasChanges);

      if (preferred === undefined || preferred === currentScope) {
        return;
      }

      get.set(annotationDraftAtom, null);
      get.set(gitChangeScopeAtom, preferred);
    })
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

export const gitBranchesAtom = LazyDiffRpcClient.query("git.branches.get", {
  data: {},
  type: "git.branches.get",
});

export const gitBranchCreateMutation =
  LazyDiffRpcClient.mutation("git.branch.create");

export const gitBranchDeleteMutation =
  LazyDiffRpcClient.mutation("git.branch.delete");

export const gitBranchSwitchMutation =
  LazyDiffRpcClient.mutation("git.branch.switch");

export const gitRepositoryAtom = LazyDiffRpcClient.query(
  "git.repository.get",
  {
    data: {},
    type: "git.repository.get",
  },
  {
    timeToLive: "Infinity",
  }
);

export const githubPrAnnotationsPostMutation = LazyDiffRpcClient.mutation(
  "github.pr.annotations.post"
);
