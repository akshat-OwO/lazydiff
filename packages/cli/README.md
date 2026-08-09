# lazydiff

Review code changes in a local web interface without getting lost in the diff.

From a Git repository with uncommitted changes, run:

```sh
npx lazydiff
```

Lazydiff starts a local server and opens the review interface in your browser. Use `npx lazydiff --no-browser` to print the URL without opening it.

Production builds hide Effect HTTP server logs by default. Run `DEBUG=1 npx lazydiff` to show the listen and request logs while keeping the startup summary.

Node.js 24 or newer is required.

Source and issue tracking are available on [GitHub](https://github.com/akshat-OwO/lazydiff).
