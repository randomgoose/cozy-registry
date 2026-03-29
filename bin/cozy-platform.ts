import "dotenv/config";

import { startPlatformServer } from "@/apps/platform/server";

const server = startPlatformServer();
const address = server.address();

if (address && typeof address === "object") {
  console.info(`[cozy-platform] listening on http://localhost:${address.port}`);
} else {
  console.info("[cozy-platform] listening");
}
