/**
 * Color theme, stored per browser. Light is the default; "system" follows the OS.
 * The pre-paint script in the root layout reads the same key, so keep the two in sync.
 */
export type Theme = "light" | "dark" | "system";
export const THEMES: Theme[] = ["light", "dark", "system"];
export const THEME_KEY = "mh-theme";

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "system") return stored;
  } catch {}
  return "light";
}

export function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}
