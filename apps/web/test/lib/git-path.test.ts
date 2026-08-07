import { strictEqual } from "node:assert";
import { test } from "node:test";

import { parsePatchFiles } from "@pierre/diffs";

import { unquoteGitPath } from "../../src/lib/git-path.ts";

const parsedName = (header: string) => {
  const [file] = parsePatchFiles(
    `${header}\nindex 111..222 100644\n@@ -1 +1 @@\n-a\n+b\n`
  ).flatMap(({ files }) => files);

  if (file === undefined) {
    throw new Error("The patch did not contain a file diff");
  }

  return file.name;
};

test("unquoted pathnames are returned untouched", () => {
  strictEqual(unquoteGitPath("src/lib/format.ts"), "src/lib/format.ts");
  strictEqual(unquoteGitPath("docs/with space.md"), "docs/with space.md");
  strictEqual(unquoteGitPath("docs/résumé.md"), "docs/résumé.md");
});

test("escaped pathnames collapse to the bytes the status tree reports", () => {
  strictEqual(unquoteGitPath(String.raw`with\"quote.txt`), 'with"quote.txt');
  strictEqual(unquoteGitPath(String.raw`back\\slash.txt`), "back\\slash.txt");
  strictEqual(unquoteGitPath(String.raw`tab\there.txt`), "tab\there.txt");
  // Octal escapes are UTF-8 bytes, so they only decode once reassembled.
  strictEqual(unquoteGitPath(String.raw`r\303\251sum\303\251.md`), "résumé.md");
});

test("surrounding quotes are stripped when the parser keeps them", () => {
  strictEqual(unquoteGitPath(String.raw`"with\"quote.txt"`), 'with"quote.txt');
});

test("names taken from quoted patch headers match the on-disk path", () => {
  strictEqual(
    unquoteGitPath(
      parsedName(String.raw`diff --git "a/od\"d.ts" "b/od\"d.ts"`)
    ),
    'od"d.ts'
  );
  strictEqual(
    unquoteGitPath(
      parsedName(
        String.raw`diff --git "a/r\303\251sum\303\251.md" "b/r\303\251sum\303\251.md"`
      )
    ),
    "résumé.md"
  );
  strictEqual(
    unquoteGitPath(parsedName("diff --git a/with space.md b/with space.md")),
    "with space.md"
  );
});
