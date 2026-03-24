#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { spawn } from "node:child_process";

function usage() {
  console.error(
    "Usage: tsx bin/run-with-env.ts <dev|prod> <command> [args...]",
  );
}

function getDatabaseHost(connectionString: string | undefined) {
  if (!connectionString) return "not set";
  try {
    return new URL(connectionString).host || "unknown";
  } catch {
    return "invalid url";
  }
}

async function main() {
  const [, , target, command, ...args] = process.argv;
  if (!target || !command || !["dev", "prod"].includes(target)) {
    usage();
    process.exit(1);
  }

  const envFile = target === "prod" ? ".env.prod" : ".env.dev";
  const loaded = loadEnv({ path: envFile, override: true });
  if (loaded.error) {
    console.error(`[cozy-env] Missing ${envFile}.`);
    process.exit(1);
  }

  const databaseUrl =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
  const appUrl =
    process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "not set";

  console.log(
    `[cozy-env] target=${target} envFile=${envFile} dbHost=${getDatabaseHost(databaseUrl)} appUrl=${appUrl}`,
  );

  const child = spawn(command, args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

void main();
