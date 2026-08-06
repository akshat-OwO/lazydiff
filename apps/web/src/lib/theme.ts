export type Theme = "dark" | "light" | "system";

const DEFAULT_THEME: Theme = "system";
const STORAGE_KEY = "lazydiff-theme";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
const THEME_CHANGE_EVENT = "lazydiff:theme-change";

function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

function readStoredTheme(): Theme {
  try {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function resolveTheme(theme: Theme): Exclude<Theme, "system"> {
  if (theme !== "system") {
    return theme;
  }
  return window.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const resolvedTheme = resolveTheme(theme);
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolvedTheme);
  document.documentElement.style.colorScheme = resolvedTheme;
}

export function initializeTheme() {
  applyTheme(readStoredTheme());
}

export function getThemeSnapshot() {
  const theme = document.documentElement.dataset.theme ?? null;
  return isTheme(theme) ? theme : DEFAULT_THEME;
}

export function getServerThemeSnapshot(): Theme {
  return DEFAULT_THEME;
}

export function setTheme(theme: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The selected theme still applies when browser storage is unavailable.
  }
  applyTheme(theme);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function subscribeToTheme(listener: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, listener);
  const mediaQuery = window.matchMedia(SYSTEM_THEME_QUERY);
  const handleSystemThemeChange = () => {
    const theme = getThemeSnapshot();
    if (theme === "system") {
      applyTheme(theme);
    }
  };
  mediaQuery.addEventListener("change", handleSystemThemeChange);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, listener);
    mediaQuery.removeEventListener("change", handleSystemThemeChange);
  };
}
