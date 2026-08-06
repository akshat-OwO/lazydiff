import { strictEqual } from "node:assert";
import { test } from "node:test";

import { Effect, Option } from "effect";

import { resolveWebUrl, WebUrlError } from "../../src/services/web-url.ts";

test("non-loopback hosts require an explicit public URL", async () => {
  const error = await resolveWebUrl({
    devWebUrl: "http://127.0.0.1:3000",
    host: "0.0.0.0",
    isProd: true,
    port: 7777,
    publicWebUrl: Option.none(),
  }).pipe(Effect.flip, Effect.runPromise);

  strictEqual(error instanceof WebUrlError, true);
  strictEqual(
    error.message,
    "LAZYDIFF_PUBLIC_URL is required when LAZYDIFF_HOST is not a loopback address"
  );
});

test("an explicit public URL defines the browser URL and allowed origin", async () => {
  const url = await resolveWebUrl({
    devWebUrl: "http://127.0.0.1:3000",
    host: "0.0.0.0",
    isProd: true,
    port: 7777,
    publicWebUrl: Option.some("http://192.168.1.20:7777/review"),
  }).pipe(Effect.runPromise);

  strictEqual(url.href, "http://192.168.1.20:7777/review");
  strictEqual(url.origin, "http://192.168.1.20:7777");
});
