import { strictEqual } from "node:assert";
import { test } from "node:test";

import { findInViewFilePath } from "../../src/lib/file-diff-in-view.ts";

test("findInViewFilePath returns null when there are no sections", () => {
  strictEqual(
    findInViewFilePath([], {
      activationOffset: 56,
      isScrolledToBottom: false,
    }),
    null
  );
});

test("findInViewFilePath keeps the first file before any section crosses", () => {
  strictEqual(
    findInViewFilePath(
      [
        { path: "a.ts", top: 120 },
        { path: "b.ts", top: 400 },
      ],
      {
        activationOffset: 56,
        isScrolledToBottom: false,
      }
    ),
    "a.ts"
  );
});

test("findInViewFilePath selects the last section at or above the activation line", () => {
  strictEqual(
    findInViewFilePath(
      [
        { path: "a.ts", top: -200 },
        { path: "b.ts", top: 40 },
        { path: "c.ts", top: 300 },
      ],
      {
        activationOffset: 56,
        isScrolledToBottom: false,
      }
    ),
    "b.ts"
  );
});

test("findInViewFilePath prefers the last file when scrolled to the bottom", () => {
  strictEqual(
    findInViewFilePath(
      [
        { path: "a.ts", top: -800 },
        { path: "b.ts", top: 200 },
      ],
      {
        activationOffset: 56,
        isScrolledToBottom: true,
      }
    ),
    "b.ts"
  );
});
