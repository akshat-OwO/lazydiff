import { strictEqual } from "node:assert";
import { test } from "node:test";

import { findInViewFilePath } from "../../src/lib/file-diff-in-view.ts";

test("findInViewFilePath returns null when there are no sections", () => {
  strictEqual(
    findInViewFilePath([], {
      activationOffset: 0,
      isScrolledToBottom: false,
      scrollTop: 0,
    }),
    null
  );
});

test("findInViewFilePath keeps the first file before any section crosses", () => {
  strictEqual(
    findInViewFilePath(
      [
        { contentTop: 0, path: "a.ts" },
        { contentTop: 280, path: "b.ts" },
      ],
      {
        activationOffset: 0,
        isScrolledToBottom: false,
        scrollTop: 40,
      }
    ),
    "a.ts"
  );
});

test("findInViewFilePath selects the last section at or above the activation line", () => {
  strictEqual(
    findInViewFilePath(
      [
        { contentTop: 0, path: "a.ts" },
        { contentTop: 200, path: "b.ts" },
        { contentTop: 500, path: "c.ts" },
      ],
      {
        activationOffset: 0,
        isScrolledToBottom: false,
        scrollTop: 200,
      }
    ),
    "b.ts"
  );
});

test("findInViewFilePath prefers the last file when scrolled to the bottom", () => {
  strictEqual(
    findInViewFilePath(
      [
        { contentTop: 0, path: "a.ts" },
        { contentTop: 1000, path: "b.ts" },
      ],
      {
        activationOffset: 0,
        isScrolledToBottom: true,
        scrollTop: 800,
      }
    ),
    "b.ts"
  );
});

test("findInViewFilePath binary-searches past many preceding sections", () => {
  const sections = Array.from({ length: 64 }, (_, index) => ({
    contentTop: index * 100,
    path: `file-${index}.ts`,
  }));

  strictEqual(
    findInViewFilePath(sections, {
      activationOffset: 0,
      isScrolledToBottom: false,
      scrollTop: 2500,
    }),
    "file-25.ts"
  );
});
