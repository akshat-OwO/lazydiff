import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { gitBranchChangesAtom } from "@/lib/rpc";

function GitBranchButton() {
  const branchChanges = useAtomValue(gitBranchChangesAtom);

  if (branchChanges._tag === "Initial") {
    return (
      <output aria-label="Connecting to Git">
        <Skeleton className="h-6 w-20" />
      </output>
    );
  }

  if (branchChanges._tag === "Failure") {
    return (
      <Button disabled size="xs" variant="outline">
        Unavailable
      </Button>
    );
  }

  const { head } = branchChanges.value.data;
  const label =
    head._tag === "Branch" ? head.name : `Detached @ ${head.commit}`;

  return (
    <Button disabled size="xs" variant="outline">
      {label}
    </Button>
  );
}

function Navbar() {
  return (
    <header className="bg-sidebar text-sidebar-foreground border-sidebar-border sticky top-0 z-40 border-b">
      <nav
        aria-label="Primary navigation"
        className="flex h-14 w-full items-center justify-between px-4 sm:px-6"
      >
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <Link
            className="text-lg font-semibold tracking-tight transition-opacity hover:opacity-80"
            to="/"
          >
            Lazydiff
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <GitBranchButton />
          <ModeToggle />
        </div>
      </nav>
    </header>
  );
}

export { Navbar };
