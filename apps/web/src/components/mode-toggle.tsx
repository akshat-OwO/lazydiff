import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function ModeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Change theme. Current theme: ${theme}`}
            className="relative"
            size="icon"
            variant="outline"
          >
            <SunIcon
              aria-hidden="true"
              className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
            />
            <MoonIcon
              aria-hidden="true"
              className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
            />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <SunIcon aria-hidden="true" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <MoonIcon aria-hidden="true" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <MonitorIcon aria-hidden="true" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { ModeToggle };
