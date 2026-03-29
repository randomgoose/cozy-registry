#!/usr/bin/env node

import "dotenv/config";
import { spawn } from "node:child_process";

function usage() {
  console.error("Usage: tsx bin/cozy-web.ts");
}

function buildCommand() {
  return {
    command: "pnpm",
    args: ["--filter", "@cozy/web", "dev"],
  };
}

function applyDefaults() {
  if (!process.env.VITE_COZY_PLATFORM_BASE_URL && process.env.COZY_PLATFORM_BASE_URL) {
    process.env.VITE_COZY_PLATFORM_BASE_URL = process.env.COZY_PLATFORM_BASE_URL;
  }
}

async function main() {
  const [, , maybeFlag, ...restArgs] = process.argv;

  if (maybeFlag === "--help" || maybeFlag === "-h") {
    usage();
    process.exit(0);
  }

  if (typeof maybeFlag !== "undefined") {
    usage();
    process.exit(1);
  }

  applyDefaults();

  const { command, args } = buildCommand();
  console.log(
    `[cozy-web] vite=http://localhost:5173 platform=${process.env.VITE_COZY_PLATFORM_BASE_URL ?? "not set"}`,
  );

  const child = spawn(command, [...args, ...restArgs], {
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
