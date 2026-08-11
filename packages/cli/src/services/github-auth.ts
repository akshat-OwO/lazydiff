import {
  Config,
  Context,
  Effect,
  Layer,
  Option,
  Redacted,
  Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

const readGithubTokenFromEnv = Effect.gen(function* () {
  const token = yield* Config.option(Config.redacted("GITHUB_TOKEN")).pipe(
    Effect.orElseSucceed(() => Option.none())
  );

  return Option.match(token, {
    onNone: () => Option.none<Redacted.Redacted<string>>(),
    onSome: (value) => {
      const trimmed = Redacted.value(value).trim();

      return trimmed.length > 0
        ? Option.some(Redacted.make(trimmed))
        : Option.none();
    },
  });
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

const make = Effect.gen(function* () {
  const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  /**
   * Resolves a GitHub token from `GITHUB_TOKEN` first, then the `gh` CLI.
   *
   * An explicit env token wins so private-repo access can override an ambient
   * `gh` login that does not have the needed repository permissions.
   */
  const resolveToken = Effect.fn("lazydiff/services/githubAuth/resolveToken")(
    function* () {
      const fromEnv = yield* readGithubTokenFromEnv;

      if (Option.isSome(fromEnv)) {
        return fromEnv;
      }

      return yield* readGhAuthToken().pipe(
        Effect.provideService(
          ChildProcessSpawner.ChildProcessSpawner,
          childProcessSpawner
        )
      );
    }
  );

  return { resolveToken };
});

export class GithubAuth extends Context.Service<
  GithubAuth,
  Effect.Success<typeof make>
>()("lazydiff/services/githubAuth") {}

export const GithubAuthLive = Layer.effect(GithubAuth, make);
