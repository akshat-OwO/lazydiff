import { Outlet, createRootRoute } from "@tanstack/react-router";

import { AppSidebar } from "@/components/app-sidebar";
import { Navbar } from "@/components/navbar";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ThemeProvider>
      <SidebarProvider className="block">
        <Navbar />
        <div className="flex min-h-[calc(100svh-3.5rem)] w-full">
          <AppSidebar />
          <SidebarInset className="min-h-[calc(100svh-3.5rem)]">
            <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
              <Outlet />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </ThemeProvider>
  );
}
