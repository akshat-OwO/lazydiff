import * as React from "react";

import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  setTheme,
  subscribeToTheme,
} from "@/lib/theme";

const ThemeProviderContext = React.createContext(false);

function ThemeProvider({ children }: React.PropsWithChildren) {
  return (
    <ThemeProviderContext.Provider value={true}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

function useTheme() {
  const isWithinProvider = React.useContext(ThemeProviderContext);
  if (!isWithinProvider) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  const theme = React.useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot
  );
  return { setTheme, theme };
}

export { ThemeProvider, useTheme };
