import { strictEqual } from "node:assert";
import { test } from "node:test";

import {
  formatStartupOutput,
  shouldShowHttpLogs,
} from "../../src/services/startup-output.ts";

test("production hides HTTP logs unless DEBUG is exactly 1", () => {
  strictEqual(shouldShowHttpLogs(true), false);
  strictEqual(shouldShowHttpLogs(true, "0"), false);
  strictEqual(shouldShowHttpLogs(true, "true"), false);
  strictEqual(shouldShowHttpLogs(true, "1"), true);
  strictEqual(shouldShowHttpLogs(false), true);
});

test("startup output includes the version, ready time, and local URL", () => {
  strictEqual(
    formatStartupOutput({
      color: false,
      elapsedMs: 1240,
      url: "http://127.0.0.1:4922/",
      version: "0.1.1",
    }),
    [
      "",
      "  LAZYDIFF v0.1.1  ready in 1.24s",
      "",
      "  ➜  Local:   http://127.0.0.1:4922/",
      "",
    ].join("\n")
  );
});

test("startup output uses the exact LAZY and DIFF brand colors", () => {
  const output = formatStartupOutput({
    color: true,
    elapsedMs: 0,
    url: "http://127.0.0.1:7777/",
    version: "0.1.1",
  });

  strictEqual(output.includes("\u001B[38;2;255;134;151mLAZY\u001B[39m"), true);
  strictEqual(output.includes("\u001B[38;2;134;239;172mDIFF\u001B[39m"), true);
});
