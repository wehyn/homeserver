"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_STORAGE_KEY = "nimbus-theme";
type Theme = "dark" | "light";

function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const isLight = theme === "light";
  const nextThemeLabel = isLight ? "dark" : "light";

  useEffect(() => {
    const storedTheme = readStoredTheme();
    setTheme(storedTheme);
    applyTheme(storedTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = isLight ? "dark" : "light";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // Keep the current session usable when storage is unavailable.
    }
  }

  return <button type="button" className="icon-button theme-toggle" onClick={toggleTheme} aria-label={`Switch to ${nextThemeLabel} mode`} aria-pressed={isLight} title={`Switch to ${nextThemeLabel} mode`}>
    {isLight ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
  </button>;
}
