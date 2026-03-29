import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { appRouter } from "./router";
import { webQueryClient } from "./lib/query-client";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing #root container for @cozy/web");
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={webQueryClient}>
      <RouterProvider router={appRouter} />
    </QueryClientProvider>
  </StrictMode>,
);
