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

export const isLoopbackHost = (host: string) =>
  host === "localhost" ||
  host === "::1" ||
  host === "[::1]" ||
  host.startsWith("127.");

const hostForUrl = (host: string) => (host.includes(":") ? `[${host}]` : host);

const originWithHost = (url: URL, host: string) => {
  const next = new URL(url.origin);
  next.hostname = host;
  return next.origin;
};

/** Loopback browser hosts that should be interchangeable for local UX. */
const loopbackBrowserHosts = ["127.0.0.1", "localhost", "[::1]"] as const;

/**
 * When serving on a loopback address, accept the usual local name variants so
 * `127.0.0.1` and `localhost` can be used interchangeably in the browser.
 */
export const resolveAllowedOrigins = (browserUrl: URL): ReadonlySet<string> => {
  const origins = new Set<string>([browserUrl.origin]);

  if (!isLoopbackHost(browserUrl.hostname)) {
    return origins;
  }

  for (const host of loopbackBrowserHosts) {
    origins.add(originWithHost(browserUrl, host));
  }

  return origins;
};

/**
 * Listen on both IPv4 and IPv6 loopback when the configured host is local, so
 * `127.0.0.1` and `localhost` (often `::1`) both reach the server.
 */
export const resolveListenHosts = (host: string): readonly string[] => {
  if (!isLoopbackHost(host)) {
    return [host];
  }

  return ["127.0.0.1", "::1"];
};

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
      (isProd
        ? `http://${hostForUrl(isLoopbackHost(host) ? "127.0.0.1" : host)}:${port}`
        : devWebUrl);

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
