import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { getCachedAuthSession } from "@/lib/auth-session";
import { createServerTimingLogger, timeAsync } from "@/lib/server-timing";
import { getCachedWorkspaceRouteAccess } from "@/lib/workspace-route";
import { WorkspaceScopeSync } from "./WorkspaceScopeSync";

export const dynamic = "force-dynamic";

export default async function WorkspaceSlugLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const timings = createServerTimingLogger("workspace-slug-layout");
  const { slug } = await params;
  const session = await timeAsync(timings, "sessionLookup", async () =>
    getCachedAuthSession(),
  );
  if (!session?.user?.id) notFound();
  const activeOrganizationId = session.session?.activeOrganizationId ?? null;

  const access = await timeAsync(timings, "workspaceAccessLoad", async () =>
    getCachedWorkspaceRouteAccess(session.user.id, slug),
  );
  if (!access.org) {
    timings.flush({
      slug: decodeURIComponent(slug),
      userId: session.user.id,
      outcome: "org-not-found",
      accessTimingsMs: access.timingsMs,
    });
    notFound();
  }
  if (!access.isMember) {
    timings.flush({
      slug: access.org.slug,
      organizationId: access.org.id,
      userId: session.user.id,
      outcome: "membership-denied",
      accessTimingsMs: access.timingsMs,
    });
    notFound();
  }

  const org = access.org;
  timings.flush({
    slug: org.slug,
    organizationId: org.id,
    userId: session.user.id,
    activeOrganizationId,
    outcome: "ok",
    accessTimingsMs: access.timingsMs,
  });

  return (
    <>
      <WorkspaceScopeSync
        organizationId={org.id}
        activeOrganizationId={activeOrganizationId}
      />
      {children}
    </>
  );
}
