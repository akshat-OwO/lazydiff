import { Outlet, createRootRoute } from "@tanstack/react-router";

import { Navbar } from "@/components/navbar";
import { ThemeProvider } from "@/components/theme-provider";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ThemeProvider>
      <div className="bg-background text-foreground min-h-svh">
        <Navbar />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </ThemeProvider>
  );
}
