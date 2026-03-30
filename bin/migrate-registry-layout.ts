#!/usr/bin/env tsx

import { runMigrateRegistryLayoutCli } from "@/lib/migrate-registry-layout";

runMigrateRegistryLayoutCli(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exit(1);
});
