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
 * Resolves a GitHub token from the `gh` CLI first, then `GITHUB_TOKEN`.
 */
export const resolveGithubToken = Effect.fn(
  "lazydiff/services/githubAuth/resolveGithubToken"
)(function* () {
  const fromGh = yield* readGhAuthToken();

  if (Option.isSome(fromGh)) {
    return fromGh;
  }

  return yield* readGithubTokenFromEnv;
});
