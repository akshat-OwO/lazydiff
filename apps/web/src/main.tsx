import { RegistryProvider } from "@effect/atom-react";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { annotationHighlightThemeCss } from "./lib/code-highlighter";
import { initializeTheme } from "./lib/theme";
import { router } from "./router";

import "./styles/app.css";

const rootElement = document.querySelector("#root");

if (!(rootElement instanceof HTMLElement)) {
  throw new Error("Root element #root was not found");
}

const highlightThemeStyle = document.createElement("style");
highlightThemeStyle.dataset.annotationHighlightTheme = "";
highlightThemeStyle.textContent = annotationHighlightThemeCss;
document.head.append(highlightThemeStyle);

initializeTheme();

createRoot(rootElement).render(
  <StrictMode>
    <RegistryProvider>
      <RouterProvider router={router} />
    </RegistryProvider>
  </StrictMode>
);
