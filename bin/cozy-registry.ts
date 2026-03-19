#!/usr/bin/env tsx

import process from "node:process";
import {
  checkInstalledItemUpdate,
  getProjectRegistryStatus,
  installRegistryBundle,
  type RegistryCoordinate,
} from "@/lib/install-protocol";

type RegistryBundleFile = {
  path: string;
  content: string;
  type: string;
};

type RegistryBundlePayload = {
  name: string;
  type: string;
  files: RegistryBundleFile[];
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "status":
      await runStatus(args.slice(1));
      break;
    case "add":
      await runAdd(args.slice(1));
      break;
    case "check":
      await runCheck(args.slice(1));
      break;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    default:
      fail(`Unknown command: ${command}`);
  }
}

async function runStatus(args: string[]) {
  const coordinate = readCoordinateArg(args[0]);
  const status = await getProjectRegistryStatus({
    projectRoot: process.cwd(),
    coordinate,
  });

  process.stdout.write(`${status.summary}\n`);
  process.stdout.write(`Project root: ${status.projectRoot}\n`);
  process.stdout.write(`Lockfile: ${status.lockfilePath}\n`);

  if (!status.items.length) {
    return;
  }

  process.stdout.write("\nInstalled items:\n");
  for (const item of status.items) {
    process.stdout.write(
      `- ${item.coordinate} (${item.type}) v${item.version}\n`,
    );
    process.stdout.write(`  source: ${item.source}\n`);
    for (const file of item.installedFiles) {
      process.stdout.write(`  file: ${file}\n`);
    }
  }
}

async function runAdd(args: string[]) {
  const coordinate = readCoordinateArg(args[0], true)!;
  const version = readFlag(args.slice(1), "--version");
  const registryBaseUrl = getRegistryBaseUrl();
  const { owner, name } = parseCoordinate(coordinate);
  const resolvedVersion = version ?? (await fetchLatestVersion(registryBaseUrl, owner, name));
  const source = `${registryBaseUrl}/api/r/${owner}/${name}?v=${resolvedVersion}`;
  const bundle = await fetchRegistryBundle(source);

  const result = await installRegistryBundle({
    projectRoot: process.cwd(),
    coordinate,
    type: bundle.type,
    version: resolvedVersion,
    source,
    files: bundle.files,
  });

  process.stdout.write(`Installed ${result.coordinate} at v${result.version}\n`);
  process.stdout.write(`Project root: ${result.projectRoot}\n`);
  process.stdout.write(`Lockfile: ${result.lockfilePath}\n`);

  if (result.changedFiles.length) {
    process.stdout.write("\nChanged files:\n");
    for (const file of result.changedFiles) {
      process.stdout.write(`- ${file}\n`);
    }
  }

  if (result.unchangedFiles.length) {
    process.stdout.write("\nUnchanged files:\n");
    for (const file of result.unchangedFiles) {
      process.stdout.write(`- ${file}\n`);
    }
  }
}

async function runCheck(args: string[]) {
  const coordinate = readCoordinateArg(args[0]);
  const registryBaseUrl = getRegistryBaseUrl();
  const status = await getProjectRegistryStatus({
    projectRoot: process.cwd(),
    coordinate,
  });

  if (!status.items.length) {
    process.stdout.write("No installed Cozy Registry items found.\n");
    return;
  }

  for (const item of status.items) {
    const result = await checkInstalledItemUpdate({
      projectRoot: process.cwd(),
      coordinate: item.coordinate,
      registryBaseUrl,
      fetchImpl: createRegistryFetch(),
    });

    process.stdout.write(`${result.item.coordinate}\n`);
    process.stdout.write(`  installed: v${result.item.installedVersion}\n`);
    process.stdout.write(`  latest:    v${result.item.latestVersion}\n`);
    process.stdout.write(`  upgradable: ${result.item.upgradable ? "yes" : "no"}\n`);
  }
}

function parseCoordinate(coordinate: RegistryCoordinate): {
  owner: string;
  name: string;
} {
  const slash = coordinate.indexOf("/");
  if (!coordinate.startsWith("@") || slash <= 1 || slash === coordinate.length - 1) {
    throw new Error(`Invalid coordinate: ${coordinate}`);
  }

  return {
    owner: coordinate.slice(1, slash),
    name: coordinate.slice(slash + 1),
  };
}

async function fetchLatestVersion(
  registryBaseUrl: string,
  owner: string,
  name: string,
): Promise<string> {
  const response = await fetch(`${registryBaseUrl}/api/registry/${owner}/${name}/versions`, {
    headers: getRegistryHeaders(),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch latest version for @${owner}/${name}: ${response.status}`,
    );
  }

  const payload = (await response.json()) as {
    currentVersion?: string;
    versions?: Array<{ version?: string }>;
  };
  const version = payload.currentVersion ?? payload.versions?.[0]?.version;
  if (!version) {
    throw new Error(`No version found for @${owner}/${name}`);
  }
  return version;
}

async function fetchRegistryBundle(sourceUrl: string): Promise<RegistryBundlePayload> {
  const response = await fetch(sourceUrl, {
    headers: getRegistryHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch registry bundle: ${response.status} ${sourceUrl}`);
  }

  const payload = (await response.json()) as Partial<RegistryBundlePayload>;
  if (!Array.isArray(payload.files)) {
    throw new Error(`Registry bundle did not contain a files array: ${sourceUrl}`);
  }

  return {
    name: typeof payload.name === "string" ? payload.name : "unknown",
    type: typeof payload.type === "string" ? payload.type : "registry:block",
    files: payload.files.filter(isRegistryBundleFile),
  };
}

function isRegistryBundleFile(value: unknown): value is RegistryBundleFile {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.path === "string" &&
    typeof record.content === "string" &&
    typeof record.type === "string"
  );
}

function getRegistryBaseUrl(): string {
  const value =
    process.env.COZY_REGISTRY_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "";

  if (!value) {
    throw new Error(
      "Missing COZY_REGISTRY_URL. Example: COZY_REGISTRY_URL=https://your-registry.example.com",
    );
  }

  return value.replace(/\/+$/, "");
}

function getRegistryHeaders(): HeadersInit {
  const headers = new Headers();
  if (process.env.COZY_REGISTRY_TOKEN) {
    headers.set("authorization", `Bearer ${process.env.COZY_REGISTRY_TOKEN}`);
  }
  if (process.env.COZY_REGISTRY_API_KEY) {
    headers.set("x-api-key", process.env.COZY_REGISTRY_API_KEY);
  }
  return headers;
}

function createRegistryFetch(): typeof fetch {
  const headers = getRegistryHeaders();
  return (input, init) => {
    const nextHeaders = new Headers(init?.headers);
    for (const [key, value] of new Headers(headers).entries()) {
      if (!nextHeaders.has(key)) {
        nextHeaders.set(key, value);
      }
    }
    return fetch(input, { ...init, headers: nextHeaders });
  };
}

function readCoordinateArg(
  value: string | undefined,
  required = false,
): RegistryCoordinate | undefined {
  if (!value) {
    if (required) {
      throw new Error("Registry coordinate is required. Example: @owner/name");
    }
    return undefined;
  }

  if (!value.startsWith("@") || !value.includes("/")) {
    throw new Error(`Invalid registry coordinate: ${value}`);
  }

  return value as RegistryCoordinate;
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function printHelp() {
  process.stdout.write(`Cozy Registry CLI

Usage:
  pnpm cozy status [@owner/name]
  pnpm cozy add @owner/name [--version 0.3.0]
  pnpm cozy check [@owner/name]

Environment:
  COZY_REGISTRY_URL      Required. Example: https://your-registry.example.com
  COZY_REGISTRY_TOKEN    Optional bearer token for private items
  COZY_REGISTRY_API_KEY  Optional API key for private items
`);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
});
