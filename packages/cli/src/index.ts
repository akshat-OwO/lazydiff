#!/usr/bin/env node

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { commands } from "@/cmds/index";
import { HttpServerConnectionsLive } from "@/services/http-server-connections";
import { VcsLive } from "@/services/vcs-live";

import packageJson from "../package.json" with { type: "json" };
import { UiInterfaceLive } from "./services/ui-interface.ts";

const AppLive = Layer.mergeAll(
  NodeServices.layer,
  FetchHttpClient.layer,
  VcsLive.pipe(
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
