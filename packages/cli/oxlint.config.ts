import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";

export default defineConfig({
  extends: [core],
  rules: {
    "func-names": ["error", "as-needed", { generators: "never" }],
  },
});
