import { Link } from "@tanstack/react-router";

import { ModeToggle } from "@/components/mode-toggle";

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
        <ModeToggle />
      </nav>
    </header>
  );
}

export { Navbar };
