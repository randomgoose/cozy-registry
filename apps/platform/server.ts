import { serve } from "@hono/node-server";
import { createPlatformApp } from "./app";

export function startPlatformServer() {
  const app = createPlatformApp();
  const port = Number(process.env.PORT ?? 3000);

  return serve({
    fetch: app.fetch,
    port,
  });
}

if (process.env.COZY_PLATFORM_AUTOSTART === "1") {
  startPlatformServer();
}
