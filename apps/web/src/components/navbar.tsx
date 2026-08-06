import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
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
    <header className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <nav
        aria-label="Primary navigation"
        className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6"
      >
        <Link
          className="text-lg font-semibold tracking-tight transition-opacity hover:opacity-80"
          to="/"
        >
          Lazydiff
        </Link>
        <div className="flex items-center gap-2">
          <GitBranchButton />
          <ModeToggle />
        </div>
      </nav>
    </header>
  );
}

export { Navbar };
