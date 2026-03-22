import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "./components/ThemeProvider";
import { ThemeToggle } from "./components/ThemeToggle";

export const metadata: Metadata = {
  title: "Cozy Registry - 组件分发中心",
  description: "设计师参与的组件分发工具，支持 Vibe Coding 与 AI 使用",
};

const themeInitScript = `(function(){try{var d=document.documentElement;var t=localStorage.getItem("cozy-theme");if(t==="light"){d.classList.remove("dark");}else if(t==="dark"){d.classList.add("dark");}else{if(window.matchMedia("(prefers-color-scheme: dark)").matches)d.classList.add("dark");else d.classList.remove("dark");}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="font-sans" suppressHydrationWarning>
      <body className="antialiased">
        <Script
          id="cozy-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        <ThemeProvider>
          {children}
          <ThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
