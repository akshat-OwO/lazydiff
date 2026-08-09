import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { Option } from "effect";

import {
  formatGithubPullRequestUrl,
  parseGithubPullRequestUrl,
} from "../../src/services/github-pull-request-url.ts";

test("parseGithubPullRequestUrl accepts canonical GitHub pull request URLs", () => {
  deepStrictEqual(
    parseGithubPullRequestUrl("https://github.com/akshat-OwO/weave/pull/1"),
    Option.some({
      host: "github.com",
      number: 1,
      owner: "akshat-OwO",
      repo: "weave",
    })
  );
});

test("parseGithubPullRequestUrl accepts www, trailing paths, and query strings", () => {
  deepStrictEqual(
    parseGithubPullRequestUrl(
      "https://www.github.com/akshat-OwO/contingency/pull/3/files?diff=split"
    ),
    Option.some({
      host: "github.com",
      number: 3,
      owner: "akshat-OwO",
      repo: "contingency",
    })
  );
});

test("parseGithubPullRequestUrl rejects unsupported URLs", () => {
  strictEqual(
    Option.isNone(
      parseGithubPullRequestUrl("https://gitlab.com/owner/repo/pull/1")
    ),
    true
  );
  strictEqual(
    Option.isNone(
      parseGithubPullRequestUrl("https://github.com/owner/repo/issues/1")
    ),
    true
  );
  strictEqual(Option.isNone(parseGithubPullRequestUrl("not-a-url")), true);
});

test("formatGithubPullRequestUrl rebuilds the canonical URL", () => {
  strictEqual(
    formatGithubPullRequestUrl({
      host: "github.com",
      number: 3,
      owner: "akshat-OwO",
      repo: "contingency",
    }),
    "https://github.com/akshat-OwO/contingency/pull/3"
  );
});
