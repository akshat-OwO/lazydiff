import { Outlet, createRootRoute } from "@tanstack/react-router";

import { AnnotationsSidebar } from "@/components/annotations-sidebar";
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
          <SidebarInset className="min-h-[calc(100svh-3.5rem)] min-w-0 flex-1">
            <Outlet />
          </SidebarInset>
          <AnnotationsSidebar />
        </div>
      </SidebarProvider>
    </ThemeProvider>
  );
}
