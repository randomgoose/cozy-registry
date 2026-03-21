import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cozy Registry - 组件分发中心",
  description: "设计师参与的组件分发工具，支持 Vibe Coding 与 AI 使用",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark font-sans">
      <body className="antialiased">{children}</body>
    </html>
  );
}
