import { strictEqual } from "node:assert";
import { test } from "node:test";

import { formatLazydiffTitle } from "../../src/lib/app-title.ts";

test("formatLazydiffTitle falls back to Lazydiff without a repository name", () => {
  strictEqual(formatLazydiffTitle(), "Lazydiff");
  strictEqual(formatLazydiffTitle(""), "Lazydiff");
});

test("formatLazydiffTitle includes the repository name", () => {
  strictEqual(formatLazydiffTitle("lazydiff"), "Lazydiff | lazydiff");
});
