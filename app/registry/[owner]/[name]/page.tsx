import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { resolveOwner } from "@/lib/owner";
import {
  getRegistryItemByScopedIdentityAndVersion,
  getRegistryItemVersions,
  getRegistryItemVersionsScoped,
  getCurrentVersion,
  toShadcnRegistryItem,
} from "@/lib/registry";
import {
  getPreviewDefaultStoryIdFromMeta,
  getPreviewStoriesFromMeta,
} from "@/lib/preview-stories";
import type { DependencyDecision } from "@/lib/dependency-diagnostics";
import { readDependencyDecisionsFromMeta } from "@/lib/third-party-dependency-governance";
import { extractPropsFromTsx } from "@/lib/validate-tsx";
import { isBarePackageSpecifier } from "@/lib/module-specifiers";
import { ComponentDetail } from "./ComponentDetail";
import { readResourceThemeLayers } from "@/lib/project-resource-relationships";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ owner: string; name: string }>;
  searchParams: Promise<{ v?: string; project?: string; story?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { owner, name } = await params;
  const requestUserId = null;
  const item = await getRegistryItemByScopedIdentityAndVersion({
    ownerId: owner,
    name,
    version: null,
    requestUserId,
  }).catch(() => null);
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
  const {
    v: versionParam,
    project: projectParam,
    story: storyParam,
  } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  const requestUserId = session?.user?.id ?? null;

  const version = versionParam && versionParam.trim() ? versionParam.trim() : null;
  const project = projectParam && projectParam.trim() ? projectParam.trim() : null;
  const story = storyParam && storyParam.trim() ? storyParam.trim() : null;

  let item: Awaited<ReturnType<typeof getRegistryItemByScopedIdentityAndVersion>>;
  try {
    item = await getRegistryItemByScopedIdentityAndVersion({
      ownerId: owner,
      projectKey: project,
      name,
      version,
      requestUserId,
    });
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
    (d) => isBarePackageSpecifier(d),
  );
  const registryDependencies = (item.registryDependencies ?? []) as string[];
  const propsFromCode = item.type !== "registry:theme" ? extractPropsFromTsx(code) : [];
  const visibility = item.visibility === "private" ? "private" : "public";

  let versions: { version: string; createdAt: Date; createdBy: string | null }[] = [];
  try {
    versions = await getRegistryItemVersionsScoped({
      ownerId: owner,
      projectKey: project,
      name,
      requestUserId,
    });
  } catch {
    // If version history fails, UI still shows current version only
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  const dependencyDiagnostics: DependencyDecision[] = readDependencyDecisionsFromMeta(
    item.meta,
  );

  return (
    <ComponentDetail
      owner={canonicalOwner}
      project={project}
      name={item.name}
      title={item.title}
      description={item.description}
      type={item.type}
      visibility={visibility}
      code={code}
      installUrl={
        baseUrl
          ? `${baseUrl}/api/r/${canonicalOwner}/${item.name}${project ? `?project=${encodeURIComponent(project)}` : ""}`
          : null
      }
      currentVersion={currentVersion}
      selectedVersion={version ?? currentVersion}
      versions={versions}
      isOwner={item.userId === requestUserId}
      dependencies={dependencies}
      dependencyDiagnostics={dependencyDiagnostics}
      registryDependencies={registryDependencies}
      propsFromCode={propsFromCode}
      previewStories={getPreviewStoriesFromMeta(item.meta)}
      defaultPreviewStoryId={getPreviewDefaultStoryIdFromMeta(item.meta)}
      requestedPreviewStoryId={story}
      themeResourceRefs={readResourceThemeLayers(item.meta)}
      files={files}
    />
  );
}
