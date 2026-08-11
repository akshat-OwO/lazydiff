# lazydiff

Review code changes in a local web interface without getting lost in the diff.

From a Git repository with uncommitted changes, run:

```sh
npx lazydiff
```

To review a GitHub or Bitbucket pull request:

```sh
npx lazydiff --pr https://github.com/owner/repo/pull/123
npx lazydiff --pr https://bitbucket.org/workspace/repo/pull-requests/123
```

Public pull requests need no credentials. Private GitHub repositories use `GITHUB_TOKEN`, or `gh auth login` when no env token is set. `GITHUB_TOKEN` takes precedence over the GitHub CLI. Private Bitbucket repositories use `BITBUCKET_TOKEN`. For Bitbucket API tokens, also set `BITBUCKET_EMAIL` to your Atlassian account email.

Lazydiff starts a local server and opens the review interface in your browser. Use `npx lazydiff --no-browser` to print the URL without opening it.

Production builds hide Effect HTTP server logs by default. Run `DEBUG=1 npx lazydiff` to show the listen and request logs while keeping the startup summary.

Node.js 24 or newer is required.

Source and issue tracking are available on [GitHub](https://github.com/akshat-OwO/lazydiff).
