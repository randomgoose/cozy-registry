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
  setTheme: (t: CozyTheme) => void;
  toggleTheme: () => void;
  mounted: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): CozyTheme {
  if (typeof window === "undefined") return "dark";
  try {
    const t = localStorage.getItem("cozy-theme");
    if (t === "light" || t === "dark") return t;
  } catch {
    // ignore
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyDomTheme(t: CozyTheme) {
  document.documentElement.classList.toggle("dark", t === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<CozyTheme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      const t = readStoredTheme();
      setThemeState(t);
      applyDomTheme(t);
      setMounted(true);
    });
  }, []);

  const setTheme = useCallback((t: CozyTheme) => {
    setThemeState(t);
    try {
      localStorage.setItem("cozy-theme", t);
    } catch {
      // ignore
    }
    applyDomTheme(t);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("cozy-theme", next);
      } catch {
        // ignore
      }
      applyDomTheme(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, mounted }),
    [theme, setTheme, toggleTheme, mounted],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
