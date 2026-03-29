import { Outlet } from "react-router-dom";
import { ThemeProvider, ThemeToggle } from "../components/layout";
import "../styles/globals.css";

export function RootLayout() {
  return (
    <ThemeProvider>
      <Outlet />
      <ThemeToggle />
    </ThemeProvider>
  );
}
