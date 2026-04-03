#!/usr/bin/env tsx
/**
 * Push components/ui entries to a remote Cozy Registry org project.
 *
 * Requires (remote):
 *   COZY_REGISTRY_URL=https://your-registry.example.com
 *   COZY_REGISTRY_TOKEN=<bearer>   or   COZY_REGISTRY_API_KEY=<key>
 *
 * Optional:
 *   REGISTRY_ORG_SLUG=indeed-cozy          (URL segment + 409 fallback)
 *   REGISTRY_TARGET_REF=@indeed-cozy       (publish target)
 *   REGISTRY_PROJECT_SLUG=dashboard
 *
 * Run from repo root: pnpm exec tsx bin/publish-org-project-ui.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

type Entry = { name: string; title: string; filename: string };

const ENTRIES: Entry[] = [
  { name: "button", title: "Button", filename: "button.tsx" },
  { name: "input", title: "Input", filename: "input.tsx" },
  { name: "table", title: "Table", filename: "table.tsx" },
  { name: "dialog", title: "Dialog", filename: "dialog.tsx" },
  {
    name: "dropdown-menu",
    title: "Dropdown Menu",
    filename: "dropdown-menu.tsx",
  },
];

function registryBaseUrl(): string {
  const raw =
    process.env.COZY_REGISTRY_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (!raw) {
    throw new Error(
      "Set COZY_REGISTRY_URL (or NEXT_PUBLIC_APP_URL) to the registry origin.",
    );
  }
  return raw.replace(/\/+$/, "");
}

function authHeaders(): Headers {
  const h = new Headers({ "Content-Type": "application/json" });
  const token = process.env.COZY_REGISTRY_TOKEN?.trim();
  const apiKey = process.env.COZY_REGISTRY_API_KEY?.trim();
  if (token) {
    h.set("authorization", `Bearer ${token}`);
  } else if (apiKey) {
    h.set("x-api-key", apiKey);
  } else {
    throw new Error("Set COZY_REGISTRY_TOKEN or COZY_REGISTRY_API_KEY.");
  }
  return h;
}

async function main() {
  const base = registryBaseUrl();
  const headers = authHeaders();
  const orgSlug = process.env.REGISTRY_ORG_SLUG?.trim() || "indeed-cozy";
  const targetRef = process.env.REGISTRY_TARGET_REF?.trim() || "@indeed-cozy";
  const project = process.env.REGISTRY_PROJECT_SLUG?.trim() || "dashboard";
  const uiDir = path.join(process.cwd(), "components", "ui");

  for (const entry of ENTRIES) {
    const fp = path.join(uiDir, entry.filename);
    const content = fs.readFileSync(fp, "utf8");

    const createRes = await fetch(`${base}/api/registry/items`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: entry.name,
        type: "registry:ui",
        title: entry.title,
        content,
        publishScope: "organization",
        targetRef,
        organizationSlug: orgSlug,
        project,
      }),
    });

    const createData: { error?: string } = await createRes
      .json()
      .catch(() => ({}));

    if (createRes.ok) {
      process.stdout.write(`created ${entry.name}\n`);
      continue;
    }

    if (createRes.status === 409) {
      const vUrl = `${base}/api/registry/${encodeURIComponent(orgSlug)}/${encodeURIComponent(entry.name)}/versions`;
      const vRes = await fetch(vUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          content,
          project,
          bump: "patch",
        }),
      });
      const vData: { error?: string; version?: string } = await vRes
        .json()
        .catch(() => ({}));
      if (!vRes.ok) {
        process.stderr.write(
          `version bump ${entry.name} failed ${vRes.status}: ${vData.error ?? JSON.stringify(vData)}\n`,
        );
        process.exitCode = 1;
        continue;
      }
      process.stdout.write(
        `bumped ${entry.name} -> ${vData.version ?? "ok"}\n`,
      );
      continue;
    }

    process.stderr.write(
      `create ${entry.name} failed ${createRes.status}: ${createData.error ?? JSON.stringify(createData)}\n`,
    );
    process.exitCode = 1;
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
