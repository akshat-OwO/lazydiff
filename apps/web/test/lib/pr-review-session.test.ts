import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import type { DiffAnnotation } from "../../src/lib/annotations.ts";
import {
  clearPrReviewSession,
  prReviewSessionMatchesHead,
  readPrReviewSession,
  writePrReviewSession,
} from "../../src/lib/pr-review-session.ts";

const pullRequest = {
  headSha: "0123456789abcdef0123456789abcdef01234567",
  number: 13,
  owner: "akshat-OwO",
  repo: "lazydiff",
  url: "https://github.com/akshat-OwO/lazydiff/pull/13",
};

const annotation: DiffAnnotation = {
  codeDiff: "+two",
  comment: "keep this",
  filePath: "a.txt",
  id: "annotation-1",
  range: { end: 2, side: "additions", start: 2 },
  scope: "committed",
};

const installMemoryLocalStorage = () => {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorage,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });
};

test("writePrReviewSession round-trips annotations and sent ids", () => {
  installMemoryLocalStorage();
  clearPrReviewSession(pullRequest);
  writePrReviewSession(pullRequest, [annotation], new Set(["annotation-1"]));

  const stored = readPrReviewSession(pullRequest);
  strictEqual(stored?.number, 13);
  deepStrictEqual(stored?.annotations, [annotation]);
  deepStrictEqual(stored?.sentAnnotationIds, ["annotation-1"]);

  clearPrReviewSession(pullRequest);
  strictEqual(readPrReviewSession(pullRequest), null);
});

test("prReviewSessionMatchesHead rejects a different pull request head", () => {
  installMemoryLocalStorage();
  clearPrReviewSession(pullRequest);
  writePrReviewSession(
    pullRequest,
    [annotation],
    new Set(),
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );

  const stored = readPrReviewSession(pullRequest);
  strictEqual(stored === null, false);
  if (stored === null) {
    return;
  }

  strictEqual(prReviewSessionMatchesHead(stored, pullRequest.headSha), false);
  strictEqual(
    prReviewSessionMatchesHead(
      stored,
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    ),
    true
  );
  strictEqual(stored.headSha, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
});

test("writePrReviewSession keeps the session head when the live PR head moves", () => {
  installMemoryLocalStorage();
  clearPrReviewSession(pullRequest);
  writePrReviewSession(
    pullRequest,
    [annotation],
    new Set(),
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );

  writePrReviewSession(
    { ...pullRequest, headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    [annotation],
    new Set(["annotation-1"]),
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );

  const stored = readPrReviewSession(pullRequest);
  strictEqual(stored?.headSha, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  deepStrictEqual(stored?.sentAnnotationIds, ["annotation-1"]);
});
