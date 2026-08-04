import { Config, Console, Effect, Layer } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { makeHttpServerLayer } from "@/services/http-server";
import { UiInterface } from "@/services/ui-interface";

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
    }).pipe(Config.nested("LAZYDIFF"));

    const browserHost =
      interfaceConfig.host === "0.0.0.0" ? "127.0.0.1" : interfaceConfig.host;
    const browserUrl = isProd
      ? `http://${browserHost}:${interfaceConfig.port}`
      : interfaceConfig.devWebUrl;

    return yield* Effect.scoped(
      Effect.gen(function* () {
        yield* Layer.build(
          makeHttpServerLayer({
            host: interfaceConfig.host,
            port: interfaceConfig.port,
            serveWebUi: isProd,
          })
        );

        if (!noBrowser) {
          yield* Console.log(`Opening browser at ${browserUrl}...`);
          yield* uiInterface.open(browserUrl);
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
