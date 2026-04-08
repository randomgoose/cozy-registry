#!/usr/bin/env tsx

import "dotenv/config";
import process from "node:process";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  organization,
  registryItems,
  registryProjectItems,
  registryProjects,
  user,
} from "@/lib/db/schema";

type Args = {
  dryRun: boolean;
  apply: boolean;
  owner: string | null;
  project: string | null;
  name: string | null;
  limit: number;
};

type CandidateRow = {
  itemId: string;
  itemName: string;
  itemTitle: string;
  itemUserId: string | null;
  itemOrganizationId: string | null;
  itemCanonicalProjectId: string | null;
  projectId: string;
  projectNamespaceKey: string;
  projectSlug: string;
  projectOwnerUserId: string | null;
  projectOrganizationId: string | null;
  projectOwnerHandle: string | null;
  projectOrganizationSlug: string | null;
};

type Candidate = {
  itemId: string;
  itemName: string;
  itemTitle: string;
  itemUserId: string | null;
  itemOrganizationId: string | null;
  projectIds: string[];
  targetProjectId: string | null;
  targetProjectKey: string | null;
  targetProjectSlug: string | null;
  ownerLabel: string | null;
  conflictItemId: string | null;
  skipReason: string | null;
};

function parseArgs(argv: string[]): Args {
  const dryRun = !argv.includes("--apply");
  const apply = argv.includes("--apply");
  const ownerArg = argv.find((arg) => arg.startsWith("--owner="));
  const projectArg = argv.find((arg) => arg.startsWith("--project="));
  const nameArg = argv.find((arg) => arg.startsWith("--name="));
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));

  const limit = (() => {
    const raw = limitArg?.split("=")[1];
    const parsed = raw ? Number.parseInt(raw, 10) : 200;
    if (!Number.isFinite(parsed) || parsed <= 0) return 200;
    return Math.min(parsed, 5000);
  })();

  return {
    dryRun,
    apply,
    owner: ownerArg?.split("=")[1]?.trim() || null,
    project: projectArg?.split("=")[1]?.trim() || null,
    name: nameArg?.split("=")[1]?.trim() || null,
    limit,
  };
}

function normalizeKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function buildOwnerLabel(row: CandidateRow): string | null {
  return row.projectOrganizationSlug ?? row.projectOwnerHandle ?? null;
}

async function loadRows(limit: number): Promise<CandidateRow[]> {
  return db
    .select({
      itemId: registryItems.id,
      itemName: registryItems.name,
      itemTitle: registryItems.title,
      itemUserId: registryItems.userId,
      itemOrganizationId: registryItems.organizationId,
      itemCanonicalProjectId: registryItems.canonicalProjectId,
      projectId: registryProjects.id,
      projectNamespaceKey: registryProjects.namespaceKey,
      projectSlug: registryProjects.slug,
      projectOwnerUserId: registryProjects.ownerUserId,
      projectOrganizationId: registryProjects.organizationId,
      projectOwnerHandle: user.handle,
      projectOrganizationSlug: organization.slug,
    })
    .from(registryProjectItems)
    .innerJoin(registryItems, eq(registryProjectItems.itemId, registryItems.id))
    .innerJoin(registryProjects, eq(registryProjectItems.projectId, registryProjects.id))
    .leftJoin(user, eq(registryProjects.ownerUserId, user.id))
    .leftJoin(organization, eq(registryProjects.organizationId, organization.id))
    .where(
      and(
        eq(registryItems.status, "active"),
        isNull(registryItems.canonicalProjectId),
      ),
    )
    .orderBy(asc(registryItems.name), asc(registryProjectItems.addedAt))
    .limit(limit);
}

async function findConflictItemId(candidate: Candidate): Promise<string | null> {
  if (!candidate.targetProjectId) return null;
  if (candidate.itemUserId == null && candidate.itemOrganizationId == null) return null;

  const ownerScopeCondition =
    candidate.itemUserId != null
      ? eq(registryItems.userId, candidate.itemUserId)
      : eq(registryItems.organizationId, candidate.itemOrganizationId!);

  const [existing] = await db
    .select({ id: registryItems.id })
    .from(registryItems)
    .where(
      and(
        eq(registryItems.name, candidate.itemName),
        eq(registryItems.canonicalProjectId, candidate.targetProjectId),
        ownerScopeCondition,
      ),
    )
    .limit(1);

  if (!existing) return null;
  return existing.id === candidate.itemId ? null : existing.id;
}

function buildCandidates(rows: CandidateRow[], args: Args): Candidate[] {
  const ownerFilter = normalizeKey(args.owner);
  const projectFilter = normalizeKey(args.project);
  const nameFilter = normalizeKey(args.name);

  const grouped = new Map<string, CandidateRow[]>();
  for (const row of rows) {
    const ownerLabel = normalizeKey(buildOwnerLabel(row));
    if (ownerFilter && ownerLabel !== ownerFilter) continue;
    if (projectFilter && normalizeKey(row.projectNamespaceKey) !== projectFilter) continue;
    if (nameFilter && normalizeKey(row.itemName) !== nameFilter) continue;
    const list = grouped.get(row.itemId) ?? [];
    list.push(row);
    grouped.set(row.itemId, list);
  }

  return [...grouped.values()].map((itemRows) => {
    const first = itemRows[0]!;
    const uniqueProjectIds = [...new Set(itemRows.map((row) => row.projectId))];
    const uniqueProjectKeys = [...new Set(itemRows.map((row) => row.projectNamespaceKey))];
    const ambiguous = uniqueProjectIds.length !== 1 || uniqueProjectKeys.length !== 1;
    return {
      itemId: first.itemId,
      itemName: first.itemName,
      itemTitle: first.itemTitle,
      itemUserId: first.itemUserId,
      itemOrganizationId: first.itemOrganizationId,
      projectIds: uniqueProjectIds,
      targetProjectId: ambiguous ? null : first.projectId,
      targetProjectKey: ambiguous ? null : first.projectNamespaceKey,
      targetProjectSlug: ambiguous ? null : first.projectSlug,
      ownerLabel: buildOwnerLabel(first),
      conflictItemId: null,
      skipReason: ambiguous
        ? "linked-to-multiple-projects"
        : null,
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await loadRows(args.limit);
  const candidates = buildCandidates(rows, args);

  let migrated = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    let skipReason = candidate.skipReason;
    let conflictItemId = candidate.conflictItemId;

    if (!skipReason) {
      conflictItemId = await findConflictItemId(candidate);
      if (conflictItemId) {
        skipReason = "canonical-conflict";
      }
    }

    const payload = {
      itemId: candidate.itemId,
      itemName: candidate.itemName,
      owner: candidate.ownerLabel,
      targetProjectKey: candidate.targetProjectKey,
      targetProjectSlug: candidate.targetProjectSlug,
      linkedProjectIds: candidate.projectIds,
      conflictItemId,
      skipReason,
      dryRun: args.dryRun,
    };

    if (skipReason) {
      process.stdout.write(`${JSON.stringify({ skipped: true, ...payload })}\n`);
      skipped += 1;
      continue;
    }

    if (args.dryRun) {
      process.stdout.write(`${JSON.stringify({ migrate: true, ...payload })}\n`);
      continue;
    }

    await db
      .update(registryItems)
      .set({
        canonicalProjectId: candidate.targetProjectId,
        canonicalProjectKey: candidate.targetProjectKey,
        updatedAt: new Date(),
      })
      .where(eq(registryItems.id, candidate.itemId));

    process.stdout.write(`${JSON.stringify({ migrated: true, ...payload })}\n`);
    migrated += 1;
  }

  process.stdout.write(
    `${JSON.stringify({
      done: true,
      dryRun: args.dryRun,
      apply: args.apply,
      owner: args.owner,
      project: args.project,
      name: args.name,
      limit: args.limit,
      matchedRows: rows.length,
      matchedItems: candidates.length,
      migrated,
      skipped,
    })}\n`,
  );
}

void main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
});
