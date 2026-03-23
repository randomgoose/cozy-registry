"use client";

import { useTheme } from "@/app/components/ThemeProvider";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  const { theme } = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            "group-[.toaster]:rounded-xl group-[.toaster]:border group-[.toaster]:border-border group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:shadow-lg",
          title: "group-[.toast]:text-foreground",
          description: "group-[.toast]:text-muted-foreground",
        },
      }}
    />
  );
}
