import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { resolveOwner } from "@/lib/owner";
import {
  getRegistryItemByOwnerNameAndVersion,
  getRegistryItemVersions,
  getCurrentVersion,
  toShadcnRegistryItem,
} from "@/lib/registry";
import { extractPropsFromTsx } from "@/lib/validate-tsx";
import { ComponentDetail } from "./ComponentDetail";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ owner: string; name: string }>;
  searchParams: Promise<{ v?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, name } = await params;
  const requestUserId = null;
  const item = await getRegistryItemByOwnerNameAndVersion(
    owner,
    name,
    null,
    requestUserId
  ).catch(() => null);
  if (!item) return { title: "Component not found" };
  const canonicalOwner =
    (await resolveOwner(item.userId ?? owner))?.handle ?? owner;
  return {
    title: `${item.title} · ${canonicalOwner}/${name}`,
    description: item.description ?? undefined,
  };
}

export default async function RegistryItemPage({ params, searchParams }: Props) {
  const { owner, name } = await params;
  const { v: versionParam } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  const requestUserId = session?.user?.id ?? null;

  const version = versionParam && versionParam.trim() ? versionParam.trim() : null;

  let item: Awaited<ReturnType<typeof getRegistryItemByOwnerNameAndVersion>>;
  try {
    item = await getRegistryItemByOwnerNameAndVersion(
      owner,
      name,
      version,
      requestUserId
    );
  } catch {
    notFound();
  }

  if (!item) notFound();

  const canonicalOwner =
    (await resolveOwner(item.userId ?? owner))?.handle ?? owner;
  const shadcnItem = toShadcnRegistryItem(item);
  const files = shadcnItem?.files ?? [];
  const code = files[0]?.content ?? "";
  const currentVersion = getCurrentVersion(item);
  const allDependencies = (item.dependencies ?? []) as string[];
  const dependencies = allDependencies.filter(
    (d) => !d.startsWith("./") && !d.startsWith("../") && !d.startsWith("/"),
  );
  const registryDependencies = (item.registryDependencies ?? []) as string[];
  const propsFromCode = item.type !== "registry:theme" ? extractPropsFromTsx(code) : [];
  const visibility = item.visibility === "private" ? "private" : "public";

  let versions: { version: string; createdAt: Date; createdBy: string | null }[] = [];
  try {
    versions = await getRegistryItemVersions(item.userId ?? owner, name, requestUserId);
  } catch {
    // If version history fails, UI still shows current version only
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  return (
    <ComponentDetail
      owner={canonicalOwner}
      name={item.name}
      title={item.title}
      description={item.description}
      type={item.type}
      visibility={visibility}
      code={code}
      installUrl={baseUrl ? `${baseUrl}/api/r/${canonicalOwner}/${item.name}` : null}
      currentVersion={currentVersion}
      selectedVersion={version ?? currentVersion}
      versions={versions}
      isOwner={item.userId === requestUserId}
      dependencies={dependencies}
      registryDependencies={registryDependencies}
      propsFromCode={propsFromCode}
      files={files}
    />
  );
}
