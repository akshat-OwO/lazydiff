# lazydiff

Review code changes in a local web interface without getting lost in the diff.

## Run

From a Git repository with uncommitted changes:

```sh
npx lazydiff
```

Lazydiff starts a local server and opens the review interface in your browser. Pass `--no-browser` to print the URL without opening it automatically.

Production builds hide Effect HTTP server logs by default. Run with `DEBUG=1` to show the listen and request logs while keeping the startup summary:

```sh
DEBUG=1 npx lazydiff
```

Lazydiff requires Node.js 24 or newer.

## Development

This repository uses [Nub](https://nubjs.com/) exclusively.

```sh
nub install
nub run dev
```

Useful quality commands:

```sh
nub run fix
nub run check
nub run check-types
nub run test
nub run build
```

## Releases

Every user-facing change should include a Changeset:

```sh
nub run changeset
```

The release workflow maintains a version pull request. After that pull request is merged, it stages the npm package for human approval. Once the staged package is approved and public, run the **Release lazydiff** workflow manually with the approved version to create the matching Git tag and GitHub release at the package's recorded publishing commit.

### First npm release

Staged publishing only works after the package exists on npm. Publish `0.1.0` once from the repository root while authenticated as an npm user with 2FA:

```sh
nub run check
nub run check-types
nub run test
nub run build
npm publish --workspace lazydiff --access public
```

Then configure the `lazydiff` package on npm under **Settings → Trusted Publisher**:

- Provider: GitHub Actions
- Organization or user: `akshat-OwO`
- Repository: `lazydiff`
- Workflow filename: `release.yml`
- Allowed action: `npm stage publish` only

For maximum security, set publishing access to require 2FA and disallow tokens. When CI stages a later version, inspect and approve it from npm's **Staged Packages** page. After npm reports that version as public, manually run the **Release lazydiff** workflow, enter that version, and finalize the GitHub release. Finalization verifies and uses the immutable commit recorded in the published package's npm metadata.

## License

[MIT](LICENSE)
