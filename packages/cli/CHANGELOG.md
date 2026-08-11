# lazydiff

## 0.2.0

### Minor Changes

- [#18](https://github.com/akshat-OwO/lazydiff/pull/18) [`a58eed4`](https://github.com/akshat-OwO/lazydiff/commit/a58eed498314875b154f62cb3a030abd75d4c448) Thanks [@akshat-OwO](https://github.com/akshat-OwO)! - Add Bitbucket Cloud pull request review support via `BITBUCKET_TOKEN` (and `BITBUCKET_EMAIL` for API tokens).

- [#13](https://github.com/akshat-OwO/lazydiff/pull/13) [`da6db04`](https://github.com/akshat-OwO/lazydiff/commit/da6db04eeaec849a0f13894b8ea0a392bb5c766c) Thanks [@akshat-OwO](https://github.com/akshat-OwO)! - Add `lazydiff --pr <github-pr-url>` to review GitHub pull request diffs, with private-repo auth via `GITHUB_TOKEN` or the GitHub CLI (`GITHUB_TOKEN` wins when both are set). While reviewing a pull request, the branch and change-scope selectors are hidden/disabled.

- [#14](https://github.com/akshat-OwO/lazydiff/pull/14) [`09691bd`](https://github.com/akshat-OwO/lazydiff/commit/09691bdabaf5ed8ca9f6d48f007911ba16a4abcd) Thanks [@akshat-OwO](https://github.com/akshat-OwO)! - While reviewing a pull request with `--pr`, local annotations can be sent as inline GitHub review comments (highlighted on the diff). Existing PR review threads render on matching lines with reply and resolve. **Start review** persists annotations in the browser so a reload does not lose in-progress notes.

### Patch Changes

- [#16](https://github.com/akshat-OwO/lazydiff/pull/16) [`bc0a540`](https://github.com/akshat-OwO/lazydiff/commit/bc0a540ad3ee02dd9604d6dba3942e597896a628) Thanks [@akshat-OwO](https://github.com/akshat-OwO)! - Harden branch-delete pending state so it always clears, and polish the theme toggle animation.

## 0.1.2

### Patch Changes

- [#11](https://github.com/akshat-OwO/lazydiff/pull/11) [`4680afa`](https://github.com/akshat-OwO/lazydiff/commit/4680afab39f0947e805defdf102008108486e16c) Thanks [@akshat-OwO](https://github.com/akshat-OwO)! - Add searchable Git branch creation, switching, and deletion controls.

- [#10](https://github.com/akshat-OwO/lazydiff/pull/10) [`80615c2`](https://github.com/akshat-OwO/lazydiff/commit/80615c2b3a6bf53fb10845e6d52b6f9d1a4fd908) Thanks [@akshat-OwO](https://github.com/akshat-OwO)! - Show a concise branded production startup summary, hide Effect HTTP logs unless `DEBUG=1` is set, and promptly close active connections during shutdown.

## 0.1.1

### Patch Changes

- [#8](https://github.com/akshat-OwO/lazydiff/pull/8) [`f9f9431`](https://github.com/akshat-OwO/lazydiff/commit/f9f943119705b4a0eb4e00e70d8b9b653810254e) Thanks [@akshat-OwO](https://github.com/akshat-OwO)! - Keep the changed-files sidebar selection in sync with the file currently in view while scrolling stacked diffs.

## 0.1.0

### Minor Changes

- Initial public release.
