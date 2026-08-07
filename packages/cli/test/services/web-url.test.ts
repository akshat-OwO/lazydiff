import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { Effect, Option } from "effect";

import {
  resolveAllowedOrigins,
  resolveListenHosts,
  resolveWebUrl,
  WebUrlError,
} from "../../src/services/web-url.ts";

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

test("loopback hosts prefer a 127.0.0.1 browser URL", async () => {
  const url = await resolveWebUrl({
    devWebUrl: "http://127.0.0.1:3000",
    host: "localhost",
    isProd: true,
    port: 7778,
    publicWebUrl: Option.none(),
  }).pipe(Effect.runPromise);

  strictEqual(url.href, "http://127.0.0.1:7778/");
});

test("resolveListenHosts binds both loopback stacks for local hosts", () => {
  deepStrictEqual(resolveListenHosts("127.0.0.1"), ["127.0.0.1", "::1"]);
  deepStrictEqual(resolveListenHosts("localhost"), ["127.0.0.1", "::1"]);
  deepStrictEqual(resolveListenHosts("0.0.0.0"), ["0.0.0.0"]);
});

test("resolveAllowedOrigins accepts localhost and 127.0.0.1 together", () => {
  const origins = resolveAllowedOrigins(new URL("http://127.0.0.1:7777"));

  strictEqual(origins.has("http://127.0.0.1:7777"), true);
  strictEqual(origins.has("http://localhost:7777"), true);
  strictEqual(origins.has("http://[::1]:7777"), true);
  strictEqual(origins.has("http://example.com:7777"), false);
});

test("resolveAllowedOrigins keeps a non-loopback public origin alone", () => {
  const origins = resolveAllowedOrigins(
    new URL("http://192.168.1.20:7777/review")
  );

  deepStrictEqual([...origins], ["http://192.168.1.20:7777"]);
});
