import { strictEqual } from "node:assert";
import { test } from "node:test";

import { parsePatchFiles } from "@pierre/diffs";

test("assembled GitHub file patches parse into FileDiffMetadata", () => {
  const patch = `diff --git a/new.sh b/new.sh
new file mode 100644
--- /dev/null
+++ b/new.sh
@@ -0,0 +1,2 @@
+#!/bin/bash
+echo hi
diff --git a/old-name.ts b/new-name.ts
similarity index 100%
rename from old-name.ts
rename to new-name.ts
diff --git a/empty.lock b/empty.lock
new file mode 100644
--- /dev/null
+++ b/empty.lock
`;

  const fileDiffs = parsePatchFiles(patch).flatMap(
    ({ files: parsedFiles }) => parsedFiles
  );

  strictEqual(fileDiffs.length, 3);
  strictEqual(fileDiffs[0]?.name, "new.sh");
  strictEqual(fileDiffs[0]?.hunks.length, 1);
  strictEqual(fileDiffs[1]?.name, "new-name.ts");
  strictEqual(fileDiffs[1]?.prevName, "old-name.ts");
  strictEqual(fileDiffs[1]?.type, "rename-pure");
  strictEqual(fileDiffs[2]?.name, "empty.lock");
  strictEqual(fileDiffs[2]?.hunks.length, 0);
});
