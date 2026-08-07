import { Config, Console, Effect, Layer } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { makeHttpServerLayer } from "@/services/http-server";
import { findAvailableListenPort } from "@/services/listen-port";
import { UiInterface } from "@/services/ui-interface";
import {
  resolveAllowedOrigins,
  resolveListenHosts,
  resolveWebUrl,
} from "@/services/web-url";

export const commands = Command.make(
  "lazydiff",
  {
    noBrowser: Flag.boolean("no-browser").pipe(Flag.withDefault(false)),
  },
  Effect.fnUntraced(function* ({ noBrowser }) {
    const isProd = process.env.NODE_ENV === "production";
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
    const { hosts, port } = yield* findAvailableListenPort({
      hosts: listenHosts,
      startPort: preferredPort,
    });
    const browserUrl = yield* resolveWebUrl({
      devWebUrl: interfaceConfig.devWebUrl,
      host: interfaceConfig.host,
      isProd,
      port,
      publicWebUrl: interfaceConfig.publicWebUrl,
    });
    const allowedOrigins = resolveAllowedOrigins(browserUrl);

    return yield* Effect.scoped(
      Effect.gen(function* () {
        for (const host of hosts) {
          // Each listen address needs its own server; avoid memoizing HttpServer.
          yield* Layer.build(
            Layer.fresh(
              makeHttpServerLayer({
                allowedOrigins,
                host,
                port,
                serveWebUi: isProd,
              })
            )
          );
        }

        if (port !== preferredPort) {
          yield* Console.log(
            `Port ${preferredPort} is in use; listening on ${port}`
          );
        }

        if (noBrowser) {
          yield* Console.log(`Lazydiff UI available at ${browserUrl.href}`);
        } else {
          yield* Console.log(`Opening browser at ${browserUrl.href}...`);
          yield* uiInterface.open(browserUrl.href);
        }

        return yield* Effect.never;
      })
    );
  })
).pipe(
  Command.withDescription(
    "Review code changes without getting lost in the diff."
  )
);
