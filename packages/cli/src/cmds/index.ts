import { Clock, Config, Console, Effect, Layer, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import { ServeError } from "effect/unstable/http/HttpServerError";

import { makeHttpServerLayer } from "@/services/http-server";
import {
  isUnsupportedListenAddress,
  withAvailableListenPort,
} from "@/services/listen-port";
import { makePrGitLive } from "@/services/pr-git";
import {
  formatStartupOutput,
  shouldShowHttpLogs,
} from "@/services/startup-output";
import { UiInterface } from "@/services/ui-interface";
import { VCSService } from "@/services/vcs";
import {
  resolveAllowedOrigins,
  resolveListenHosts,
  resolveWebUrl,
} from "@/services/web-url";

import packageJson from "../../package.json" with { type: "json" };
import { GitLive } from "../services/git.ts";

const runReviewServer = Effect.fnUntraced(function* ({
  noBrowser,
}: {
  readonly noBrowser: boolean;
}) {
  const startedAt = yield* Clock.currentTimeMillis;
  const isProd = process.env.NODE_ENV === "production";
  const showHttpLogs = shouldShowHttpLogs(isProd, process.env.DEBUG);
  const uiInterface = yield* UiInterface;

  const interfaceConfig = yield* Config.all({
    devWebUrl: Config.string("DEV_WEB_URL").pipe(
      Config.withDefault("http://127.0.0.1:3000")
    ),
    host: Config.string("HOST").pipe(Config.withDefault("127.0.0.1")),
    port: Config.number("PORT").pipe(Config.withDefault(7777)),
    publicWebUrl: Config.string("PUBLIC_URL").pipe(Config.option),
  }).pipe(Config.nested("LAZYDIFF"));

  const preferredPort = interfaceConfig.port;
  const listenHosts = resolveListenHosts(interfaceConfig.host);

  return yield* withAvailableListenPort(
    {
      hosts: listenHosts,
      startPort: preferredPort,
    },
    ({ hosts, port }) =>
      Effect.scoped(
        Effect.gen(function* () {
          const browserUrl = yield* resolveWebUrl({
            devWebUrl: interfaceConfig.devWebUrl,
            host: interfaceConfig.host,
            isProd,
            port,
            publicWebUrl: interfaceConfig.publicWebUrl,
          });
          const allowedOrigins = resolveAllowedOrigins(browserUrl);

          for (const host of hosts) {
            // Each listen address needs its own server; avoid memoizing HttpServer.
            yield* Layer.build(
              Layer.fresh(
                makeHttpServerLayer({
                  allowedOrigins,
                  host,
                  port,
                  serveWebUi: isProd,
                  showHttpLogs,
                })
              )
            ).pipe(
              Effect.catchIf(
                (error): error is ServeError =>
                  error instanceof ServeError &&
                  isUnsupportedListenAddress(error.cause),
                () => Effect.void
              )
            );
          }

          if (port !== preferredPort) {
            yield* Console.log(
              `Port ${preferredPort} is in use; listening on ${port}`
            );
          }

          if (isProd) {
            const readyAt = yield* Clock.currentTimeMillis;
            yield* Console.log(
              formatStartupOutput({
                elapsedMs: readyAt - startedAt,
                url: browserUrl.href,
                version: packageJson.version,
              })
            );
          } else if (noBrowser) {
            yield* Console.log(`Lazydiff UI available at ${browserUrl.href}`);
          } else {
            yield* Console.log(`Opening browser at ${browserUrl.href}...`);
          }

          if (!noBrowser) {
            yield* uiInterface.open(browserUrl.href);
          }

          return yield* Effect.never;
        })
      )
  );
});

export const commands = Command.make(
  "lazydiff",
  {
    noBrowser: Flag.boolean("no-browser").pipe(Flag.withDefault(false)),
    pr: Flag.optional(
      Flag.string("pr").pipe(
        Flag.withAlias("p"),
        Flag.withDescription("GitHub pull request URL to review"),
        Flag.withMetavar("URL")
      )
    ),
  },
  Effect.fnUntraced(function* ({ noBrowser, pr }) {
    if (Option.isSome(pr)) {
      const vcs = yield* VCSService;
      const session = yield* vcs.openPullRequest(pr.value);

      yield* Console.log(
        `Reviewing pull request ${session.url} (${session.title})`
      );

      return yield* runReviewServer({ noBrowser }).pipe(
        Effect.provide(makePrGitLive(session))
      );
    }

    return yield* runReviewServer({ noBrowser }).pipe(Effect.provide(GitLive));
  })
).pipe(
  Command.withDescription(
    "Review code changes without getting lost in the diff."
  )
);
