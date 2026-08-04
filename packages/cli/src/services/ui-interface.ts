import { Context, Effect, Layer } from "effect";
import open from "open";

const make = Effect.sync(() => {
  const openInterface = Effect.fn(
    "lazydiff/services/uiInterface/openInterface"
  )((url: string) => Effect.asVoid(Effect.promise(() => open(url))));

  return { open: openInterface };
});

type UiInterfaceShape = Effect.Success<typeof make>;

export const UiInterface = Context.Service<UiInterfaceShape>(
  "lazydiff/services/uiInterface"
);

export const UiInterfaceLive = Layer.effect(UiInterface, make);
