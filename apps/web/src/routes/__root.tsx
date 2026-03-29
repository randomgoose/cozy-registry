/// <reference types="vite/client" />
import type { ReactNode } from "react";
import {
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { ThemeProvider, ThemeToggle } from "../components/layout";
import "../styles/globals.css";

const themeInitScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem("cozy-theme");if(t==="light"){d.classList.remove("dark");}else if(t==="dark"){d.classList.add("dark");}else{if(window.matchMedia("(prefers-color-scheme: dark)").matches)d.classList.add("dark");else d.classList.remove("dark");}}catch(e){}})();`;

export function RootComponent() {
  return (
    <RootDocument>
      <ThemeProvider>
        <Outlet />
        <ThemeToggle />
      </ThemeProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="font-sans" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export function getRootHead() {
  return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Cozy Registry" },
      {
        name: "description",
        content:
          "A component registry for design-led teams, Vibe Coding, and AI-assisted workflows.",
      },
    ],
  };
}
