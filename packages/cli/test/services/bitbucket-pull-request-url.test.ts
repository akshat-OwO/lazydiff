import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { Option } from "effect";

import {
  formatBitbucketPullRequestUrl,
  parseBitbucketPullRequestUrl,
} from "../../src/services/bitbucket-pull-request-url.ts";

test("parseBitbucketPullRequestUrl accepts canonical Bitbucket pull request URLs", () => {
  deepStrictEqual(
    parseBitbucketPullRequestUrl(
      "https://bitbucket.org/bitbucketpipelines/official-pipes/pull-requests/897"
    ),
    Option.some({
      host: "bitbucket.org",
      number: 897,
      owner: "bitbucketpipelines",
      repo: "official-pipes",
    })
  );
});

test("parseBitbucketPullRequestUrl accepts www, trailing paths, and query strings", () => {
  deepStrictEqual(
    parseBitbucketPullRequestUrl(
      "https://www.bitbucket.org/acme/demo/pull-requests/12/overview?tab=diff"
    ),
    Option.some({
      host: "bitbucket.org",
      number: 12,
      owner: "acme",
      repo: "demo",
    })
  );
});

test("parseBitbucketPullRequestUrl rejects unsupported URLs", () => {
  strictEqual(
    Option.isNone(
      parseBitbucketPullRequestUrl("https://github.com/owner/repo/pull/1")
    ),
    true
  );
  strictEqual(
    Option.isNone(
      parseBitbucketPullRequestUrl("https://bitbucket.org/owner/repo/pull/1")
    ),
    true
  );
  strictEqual(Option.isNone(parseBitbucketPullRequestUrl("not-a-url")), true);
});

test("formatBitbucketPullRequestUrl builds the canonical URL", () => {
  strictEqual(
    formatBitbucketPullRequestUrl({
      host: "bitbucket.org",
      number: 897,
      owner: "bitbucketpipelines",
      repo: "official-pipes",
    }),
    "https://bitbucket.org/bitbucketpipelines/official-pipes/pull-requests/897"
  );
});
