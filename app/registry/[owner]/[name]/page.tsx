import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
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
  if (!item) return { title: "组件未找到" };
  return {
    title: `${item.title} · ${owner}/${name}`,
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

  const shadcnItem = toShadcnRegistryItem(item);
  const files = shadcnItem?.files ?? [];
  const code = files[0]?.content ?? "";
  const currentVersion = getCurrentVersion(item);
  const dependencies = (item.dependencies ?? []) as string[];
  const registryDependencies = (item.registryDependencies ?? []) as string[];
  const propsFromCode = item.type !== "registry:theme" ? extractPropsFromTsx(code) : [];

  let versions: { version: string; createdAt: Date; createdBy: string | null }[] = [];
  try {
    versions = await getRegistryItemVersions(owner, name, requestUserId);
  } catch {
    // 无版本历史时仅显示当前
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  return (
    <ComponentDetail
      owner={owner}
      name={item.name}
      title={item.title}
      description={item.description}
      type={item.type}
      code={code}
      installUrl={baseUrl ? `${baseUrl}/api/r/${owner}/${item.name}` : null}
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
