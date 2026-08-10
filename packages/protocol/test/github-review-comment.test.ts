import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import {
  annotationRangeToGithubReviewComment,
  githubSideToPierre,
  pierreSideToGithub,
} from "../src/github-review-comment.ts";

test("pierreSideToGithub maps additions to RIGHT and deletions to LEFT", () => {
  strictEqual(pierreSideToGithub("additions"), "RIGHT");
  strictEqual(pierreSideToGithub("deletions"), "LEFT");
  strictEqual(githubSideToPierre("RIGHT"), "additions");
  strictEqual(githubSideToPierre("LEFT"), "deletions");
});

test("annotationRangeToGithubReviewComment omits start fields for one line", () => {
  deepStrictEqual(
    annotationRangeToGithubReviewComment({
      body: "nits",
      filePath: "a.ts",
      range: { end: 9, side: "deletions", start: 9 },
    }),
    {
      body: "nits",
      line: 9,
      path: "a.ts",
      side: "LEFT",
    }
  );
});

test("annotationRangeToGithubReviewComment keeps multi-line coordinates", () => {
  deepStrictEqual(
    annotationRangeToGithubReviewComment({
      body: "rename this",
      filePath: "a.ts",
      range: {
        end: 4,
        endSide: "additions",
        side: "additions",
        start: 2,
      },
    }),
    {
      body: "rename this",
      line: 4,
      path: "a.ts",
      side: "RIGHT",
      startLine: 2,
      startSide: "RIGHT",
    }
  );
});
