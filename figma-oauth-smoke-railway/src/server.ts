import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOST ?? "0.0.0.0";

serve(
  {
    fetch: app.fetch,
    port,
    hostname,
  },
  (info) => {
    console.info(
      `[figma-oauth-smoke-railway] listening on http://${info.address === "0.0.0.0" ? "0.0.0.0" : info.address}:${info.port}`,
    );
  },
);
