import { Config, Console, Effect, Layer } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { makeHttpServerLayer } from "@/services/http-server";
import { UiInterface } from "@/services/ui-interface";
import { resolveWebUrl } from "@/services/web-url";

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

    const browserUrl = yield* resolveWebUrl({
      devWebUrl: interfaceConfig.devWebUrl,
      host: interfaceConfig.host,
      isProd,
      port: interfaceConfig.port,
      publicWebUrl: interfaceConfig.publicWebUrl,
    });
    return yield* Effect.scoped(
      Effect.gen(function* () {
        yield* Layer.build(
          makeHttpServerLayer({
            allowedOrigin: browserUrl.origin,
            host: interfaceConfig.host,
            port: interfaceConfig.port,
            serveWebUi: isProd,
          })
        );

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
