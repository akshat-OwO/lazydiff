import { Data, Effect, Option } from "effect";

export class WebUrlError extends Data.TaggedError("WebUrlError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export interface WebUrlOptions {
  readonly devWebUrl: string;
  readonly host: string;
  readonly isProd: boolean;
  readonly port: number;
  readonly publicWebUrl: Option.Option<string>;
}

const isLoopbackHost = (host: string) =>
  host === "localhost" || host === "::1" || host.startsWith("127.");

const hostForUrl = (host: string) => (host.includes(":") ? `[${host}]` : host);

export const resolveWebUrl = Effect.fn("lazydiff/services/web-url/resolve")(
  function* ({ devWebUrl, host, isProd, port, publicWebUrl }: WebUrlOptions) {
    const configuredPublicUrl = Option.getOrUndefined(publicWebUrl);

    if (configuredPublicUrl === undefined && !isLoopbackHost(host)) {
      return yield* Effect.fail(
        new WebUrlError({
          message:
            "LAZYDIFF_PUBLIC_URL is required when LAZYDIFF_HOST is not a loopback address",
        })
      );
    }

    const input =
      configuredPublicUrl ??
      (isProd ? `http://${hostForUrl(host)}:${port}` : devWebUrl);

    return yield* Effect.try({
      catch: (cause) =>
        new WebUrlError({
          cause,
          message: `Invalid lazydiff web URL: ${input}`,
        }),
      try: () => new URL(input),
    });
  }
);
