import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const internalRequestPrefixes = ["/@", "/node_modules/", "/ws"];

/**
 * Diff routes carry the reviewed file path, so a document request such as
 * `/src/main.tsx` has to load the app instead of the dev server's own module
 * for that path. Mirrors the fallback the CLI server serves in production.
 */
const documentFallback = (): Plugin => ({
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      const { url } = request;
      const isDocumentRequest =
        request.method === "GET" &&
        url !== undefined &&
        request.headers.accept?.includes("text/html") === true &&
        !internalRequestPrefixes.some((prefix) => url.startsWith(prefix));

      if (isDocumentRequest) {
        request.url = "/index.html";
      }

      next();
    });
  },
  name: "lazydiff/document-fallback",
});

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({
      autoCodeSplitting: true,
      target: "react",
    }),
    viteReact(),
    documentFallback(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: "127.0.0.1",
    port: 3000,
    proxy: {
      "/ws": {
        target: "http://127.0.0.1:7777",
        ws: true,
      },
    },
  },
});
