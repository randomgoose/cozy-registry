import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "figma-oauth-smoke",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: "1.5rem", lineHeight: 1.5 }}>
        {children}
      </body>
    </html>
  );
}
