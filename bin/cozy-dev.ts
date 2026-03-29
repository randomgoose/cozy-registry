#!/usr/bin/env node

import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";

type ManagedProcess = {
  label: string;
  child: ChildProcess;
};

function usage() {
  console.error("Usage: tsx bin/cozy-dev.ts");
}

function applyDefaults() {
  if (!process.env.COZY_PLATFORM_BASE_URL) {
    process.env.COZY_PLATFORM_BASE_URL = "http://localhost:3000";
  }

  if (!process.env.VITE_COZY_PLATFORM_BASE_URL) {
    process.env.VITE_COZY_PLATFORM_BASE_URL = process.env.COZY_PLATFORM_BASE_URL;
  }
}

function startProcess(label: string, args: string[]) {
  const child = spawn("pnpm", args, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  return { label, child };
}

function stopAll(processes: ManagedProcess[], signal: NodeJS.Signals) {
  for (const { child } of processes) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

async function main() {
  const [, , maybeFlag] = process.argv;

  if (maybeFlag === "--help" || maybeFlag === "-h") {
    usage();
    process.exit(0);
  }

  if (typeof maybeFlag !== "undefined") {
    usage();
    process.exit(1);
  }

  applyDefaults();

  console.log(
    `[cozy-dev] web=http://localhost:5173 platform=${process.env.COZY_PLATFORM_BASE_URL}`,
  );

  const processes = [
    startProcess("platform", ["cozy-platform"]),
    startProcess("web", ["cozy-web"]),
  ];

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    stopAll(processes, signal);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  for (const { label, child } of processes) {
    child.on("exit", (code, signal) => {
      if (!shuttingDown) {
        shuttingDown = true;
        stopAll(processes, signal ?? "SIGTERM");
      }

      if (signal) {
        console.error(`[cozy-dev] ${label} exited with signal ${signal}`);
        process.exit(1);
        return;
      }

      if ((code ?? 0) !== 0) {
        console.error(`[cozy-dev] ${label} exited with code ${code ?? 1}`);
        process.exit(code ?? 1);
      }
    });
  }
}

void main();
