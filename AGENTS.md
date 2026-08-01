# Repository Instructions

These instructions apply to the entire repository.

## Priorities

- Prefer correctness, performance, and reliability over speed of implementation or convenience.
- Fix root causes. Do not use compatibility hacks, monkey patches, duplicated state, warning suppression, arbitrary sleeps, or silent fallbacks to make a symptom disappear.
- Keep changes minimal and cohesive, but do not trade away type safety, observability, cancellation, resource safety, or predictable failure behavior.
- Measure performance-sensitive work. Avoid speculative optimization, unbounded concurrency, unnecessary allocations, repeated parsing, and redundant I/O.
- Make timeouts, retries, backoff, concurrency limits, cleanup, and failure policies explicit where they matter.

## Package Manager and Commands

- Use Nub exclusively. Do not use `npm`, `npx`, `pnpm`, `pnpx`, `yarn`, `bun`, or `bunx`.
- Use `nub install` for installation, `nub add` and `nub remove` for dependencies, `nub run` for package scripts, `nub exec` for installed binaries, and `nub dlx` for one-off packages.
- Run commands from the repository root unless a workspace-specific command requires another directory.
- Preserve `nub.lock`; do not create or maintain a second package-manager lockfile as a workaround for tooling.

## Effect

- Use Effect for all new application and runtime logic. Model async work, errors, dependencies, configuration, concurrency, retries, scheduling, resource lifetimes, and cleanup with Effect.
- Keep raw promises, thrown exceptions, mutable global state, and direct platform effects at narrow integration boundaries. Convert them into Effect immediately.
- Preserve typed success, error, and requirement channels. Do not erase failures into `unknown`, catch-all success values, or unchecked exceptions.
- Use explicit services and scoped resources instead of hidden dependencies or manual lifecycle management.
- Use a single, intentional runtime boundary at each executable entry point. Do not scatter Effect execution throughout business logic.
- Plain data and mandatory framework or tool configuration may remain plain when no runtime behavior is involved.

### Source-first Effect rule

Never rely on memory when using Effect, including for familiar APIs.

Before writing, editing, reviewing, or recommending Effect code:

1. Identify the exact installed Effect package and version from `package.json`, `nub.lock`, and `node_modules`.
2. Inspect the relevant source and type declarations under `node_modules/effect` or the applicable `node_modules/@effect/*` package using `rg` and direct file reads.
3. Inspect local tests or examples in the installed package when signatures, semantics, resource behavior, or version differences are unclear.
4. Implement only against the API and behavior verified in the installed source. Do not invent APIs or substitute remembered APIs from another Effect version.

If the required Effect package is not installed, add it with Nub first, then inspect the installed source before implementing. Online documentation may provide context, but it never replaces checking the installed source for this repository.

## Ultracite Quality Gate

This repository uses Ultracite with Oxlint and Oxfmt through Turborepo root tasks.

After every task that changes files:

1. Run `nub run fix` to apply safe lint and formatting fixes.
2. Run `nub run check` and require it to pass before declaring the task complete.
3. Run relevant tests, type checks, builds, or focused verification in addition to the quality commands. The Ultracite checks do not replace behavioral verification.

When changing Ultracite, Oxlint, Oxfmt, or editor configuration, also run `nub exec ultracite doctor`.

Do not skip, weaken, suppress, or work around quality failures. Resolve the underlying issue. If a failure cannot be resolved safely within scope, report it explicitly with the command and error output.

## TypeScript and Code Quality

- Keep TypeScript strict and preserve useful inference. Prefer `unknown` to `any` and narrowing to assertions.
- Make invalid states unrepresentable where practical. Validate untrusted data at boundaries.
- Keep functions focused, names precise, and control flow easy to audit.
- Await or compose every asynchronous operation. Do not leave floating work.
- Avoid `console.log`, `debugger`, disabled tests, unsafe evaluation, and hidden side effects in production code.
- Add focused tests for behavior changes, especially failure, cancellation, retry, concurrency, and cleanup paths.
