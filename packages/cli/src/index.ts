#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { commands } from "@/cmds/index";
import { BitbucketAuthLive } from "@/services/bitbucket-auth";
import { GithubAuthLive } from "@/services/github-auth";
import { HttpServerConnectionsLive } from "@/services/http-server-connections";
import { VcsLive } from "@/services/vcs-live";

import packageJson from "../package.json" with { type: "json" };
import { UiInterfaceLive } from "./services/ui-interface.ts";

const GithubAuthLayer = GithubAuthLive.pipe(Layer.provide(NodeServices.layer));

const AppLive = Layer.mergeAll(
  NodeServices.layer,
  FetchHttpClient.layer,
  GithubAuthLayer,
  BitbucketAuthLive,
  VcsLive.pipe(
    Layer.provide(GithubAuthLayer),
    Layer.provide(BitbucketAuthLive),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(NodeServices.layer)
  ),
  HttpServerConnectionsLive,
  UiInterfaceLive
);

commands.pipe(
  Command.run({ version: packageJson.version }),
  Effect.provide(AppLive),
  NodeRuntime.runMain
);
