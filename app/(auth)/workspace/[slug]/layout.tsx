import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { isUserOrganizationMember, resolveOrganizationBySlug } from "@/lib/registry-organization";
import { WorkspaceScopeSync } from "./WorkspaceScopeSync";

export const dynamic = "force-dynamic";

export default async function WorkspaceSlugLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) notFound();

  const org = await resolveOrganizationBySlug(decodeURIComponent(slug));
  if (!org) notFound();

  const allowed = await isUserOrganizationMember(session.user.id, org.id);
  if (!allowed) notFound();

  return (
    <>
      <WorkspaceScopeSync organizationId={org.id} />
      {children}
    </>
  );
}
