"use client";

import { motion } from "motion/react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

const slot = "h-14 w-14";

export function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useTheme();
  const isDark = theme === "dark";

  if (!mounted) {
    return (
      <div
        className={`fixed z-[100] ${slot} rounded-2xl border border-zinc-200/80 bg-white/90 shadow-lg backdrop-blur-md dark:border-zinc-700/80 dark:bg-zinc-900/90`}
        style={{
          bottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))",
          right: "max(1.25rem, env(safe-area-inset-right, 0px))",
        }}
        aria-hidden
      />
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`group fixed z-[100] overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/95 shadow-[0_8px_30px_rgba(0,0,0,0.12)] backdrop-blur-md transition-[box-shadow,transform] hover:scale-[1.03] hover:shadow-[0_12px_40px_rgba(0,0,0,0.16)] active:scale-[0.98] dark:border-zinc-600/90 dark:bg-zinc-900/95 dark:shadow-[0_8px_30px_rgba(0,0,0,0.45)] dark:hover:shadow-[0_14px_44px_rgba(0,0,0,0.55)] ${slot}`}
      style={{
        bottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))",
        right: "max(1.25rem, env(safe-area-inset-right, 0px))",
      }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      <motion.div
        className="flex flex-col"
        initial={false}
        animate={{ y: isDark ? "-50%" : "0%" }}
        transition={{
          type: "spring",
          stiffness: 420,
          damping: 32,
          mass: 0.7,
        }}
      >
        <span
          className={`flex shrink-0 items-center justify-center ${slot} text-amber-500`}
        >
          <Sun
            className="h-7 w-7 transition-transform duration-200 group-hover:rotate-12"
            strokeWidth={2}
            aria-hidden
          />
        </span>
        <span
          className={`flex shrink-0 items-center justify-center ${slot} text-sky-400 dark:text-sky-300`}
        >
          <Moon
            className="h-7 w-7 transition-transform duration-200 group-hover:-rotate-12"
            strokeWidth={2}
            aria-hidden
          />
        </span>
      </motion.div>
    </button>
  );
}
