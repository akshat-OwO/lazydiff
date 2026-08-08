import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  entry: "src/index.ts",
  env: {
    NODE_ENV: "production",
  },
  fixedExtension: false,
  format: "esm",
  outDir: "dist",
  platform: "node",
  target: "node24",
});
