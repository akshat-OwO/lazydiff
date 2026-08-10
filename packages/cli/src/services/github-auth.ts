import { Effect, Option, Redacted, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const readGithubTokenFromEnv = Effect.sync(() => {
  const token = process.env.GITHUB_TOKEN?.trim();

  return token !== undefined && token.length > 0
    ? Option.some(Redacted.make(token))
    : Option.none<Redacted.Redacted<string>>();
});

const readGhAuthToken = Effect.fn(
  "lazydiff/services/githubAuth/readGhAuthToken"
)(() =>
  Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(
        ChildProcess.make("gh", ["auth", "token"])
      );
      const { exitCode, stdout } = yield* Effect.all(
        {
          exitCode: handle.exitCode,
          stderr: Stream.mkString(Stream.decodeText(handle.stderr)),
          stdout: Stream.mkString(Stream.decodeText(handle.stdout)),
        },
        { concurrency: "unbounded" }
      );

      if (exitCode !== 0) {
        return Option.none<Redacted.Redacted<string>>();
      }

      const token = stdout.trim();

      return token.length > 0
        ? Option.some(Redacted.make(token))
        : Option.none();
    })
  ).pipe(Effect.catchCause(() => Effect.succeed(Option.none())))
);

/**
 * Resolves a GitHub token from `GITHUB_TOKEN` first, then the `gh` CLI.
 *
 * An explicit env token wins so private-repo access can override an ambient
 * `gh` login that does not have the needed repository permissions.
 */
export const resolveGithubToken = Effect.fn(
  "lazydiff/services/githubAuth/resolveGithubToken"
)(function* () {
  const fromEnv = yield* readGithubTokenFromEnv;

  if (Option.isSome(fromEnv)) {
    return fromEnv;
  }

  return yield* readGhAuthToken();
});
