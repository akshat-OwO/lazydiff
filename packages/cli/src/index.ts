#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";

import { commands } from "@/cmds/index";
import { HttpServerConnectionsLive } from "@/services/http-server-connections";

import packageJson from "../package.json" with { type: "json" };
import { GitLive } from "./services/git.ts";
import { UiInterfaceLive } from "./services/ui-interface.ts";

const AppLive = Layer.mergeAll(
  NodeServices.layer,
  GitLive.pipe(Layer.provide(NodeServices.layer)),
  HttpServerConnectionsLive,
  UiInterfaceLive
);

commands.pipe(
  Command.run({ version: packageJson.version }),
  Effect.provide(AppLive),
  NodeRuntime.runMain
);
