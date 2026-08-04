import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { Command } from "effect/unstable/cli";

import { commands } from "@/cmds/index";

import packageJson from "../package.json" with { type: "json" };
import { UiInterfaceLive } from "./services/ui-interface.ts";

const AppLive = Layer.merge(NodeServices.layer, UiInterfaceLive);

commands.pipe(
  Command.run({ version: packageJson.version }),
  Effect.provide(AppLive),
  NodeRuntime.runMain
);
