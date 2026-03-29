"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CozyTheme = "light" | "dark";

type ThemeContextValue = {
  theme: CozyTheme;
  setTheme: (theme: CozyTheme) => void;
  toggleTheme: () => void;
  mounted: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): CozyTheme {
  if (typeof window === "undefined") return "dark";
  try {
    const value = localStorage.getItem("cozy-theme");
    if (value === "light" || value === "dark") return value;
  } catch {
    // ignore local storage read failures
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyDomTheme(theme: CozyTheme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<CozyTheme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const nextTheme = readStoredTheme();
      setThemeState(nextTheme);
      applyDomTheme(nextTheme);
      setMounted(true);
    });
  }, []);

  const setTheme = useCallback((nextTheme: CozyTheme) => {
    setThemeState(nextTheme);
    try {
      localStorage.setItem("cozy-theme", nextTheme);
    } catch {
      // ignore local storage write failures
    }
    applyDomTheme(nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((previousTheme) => {
      const nextTheme = previousTheme === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("cozy-theme", nextTheme);
      } catch {
        // ignore local storage write failures
      }
      applyDomTheme(nextTheme);
      return nextTheme;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, mounted }),
    [theme, setTheme, toggleTheme, mounted],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
