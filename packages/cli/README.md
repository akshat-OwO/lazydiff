# lazydiff

Review code changes in a local web interface without getting lost in the diff.

From a Git repository with uncommitted changes, run:

```sh
npx lazydiff
```

To review a GitHub pull request:

```sh
npx lazydiff --pr https://github.com/owner/repo/pull/123
```

Public pull requests need no credentials. Private repositories use `gh auth token`, or `GITHUB_TOKEN` when the GitHub CLI is unavailable.

Lazydiff starts a local server and opens the review interface in your browser. Use `npx lazydiff --no-browser` to print the URL without opening it.

Production builds hide Effect HTTP server logs by default. Run `DEBUG=1 npx lazydiff` to show the listen and request logs while keeping the startup summary.

Node.js 24 or newer is required.

Source and issue tracking are available on [GitHub](https://github.com/akshat-OwO/lazydiff).
