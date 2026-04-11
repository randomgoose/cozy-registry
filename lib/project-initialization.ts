import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { registryProjects } from "@/lib/db/schema";
import { resolveOwner } from "@/lib/owner";
import { createRegistryItem } from "@/lib/registry";
import { getOrganizationCanonicalOwnerRef } from "@/lib/registry-organization";
import { parseRegistryDependencyRef } from "@/lib/registry-graph";
import { getProjectInitializationConfig } from "@/lib/starter-kits";
import { loadStarterTemplate } from "@/lib/starter-template-loader";
import { buildRegistryResourcePayloadFromStarterTemplate } from "@/lib/starter-template-payload";
import {
  evaluateThirdPartyDependencies,
  excludeExplicitRegistryDependencies,
} from "@/lib/third-party-dependency-governance";
import { extractDependencies, isRelativeImport } from "@/lib/validate-tsx";
import type { RegistryProjectRow } from "@/lib/project-permissions";

export async function materializeProjectInitialization(params: {
  createMode: "empty" | "primitives-kit";
  project: RegistryProjectRow;
  requestUserId: string;
}) {
  const initialization = getProjectInitializationConfig(params.createMode);
  if (!initialization.starterKit) {
    return {
      starterKit: null,
      createdItems: [] as string[],
      defaultThemeResourceRefs: params.project.defaultThemeResourceRefs ?? [],
    };
  }

  const createdItems: string[] = [];
  const createdRefsByTemplateKey = new Map<string, string>();
  const pendingTemplateKeys = new Set<string>();
  const materializedThemeRefs: string[] = [];

  const ownerRef =
    params.project.organizationId != null
      ? (await getOrganizationCanonicalOwnerRef(params.project.organizationId)) ??
        params.project.organizationId
      : (await resolveOwner(params.project.ownerUserId ?? ""))?.handle ??
        params.project.ownerUserId ??
        "legacy";

  async function materializeTemplate(templateKey: string, fallbackName: string): Promise<string> {
    const existingRef = createdRefsByTemplateKey.get(templateKey);
    if (existingRef) return existingRef;
    if (pendingTemplateKeys.has(templateKey)) {
      throw new Error(`Starter template dependency cycle detected at ${templateKey}`);
    }

    pendingTemplateKeys.add(templateKey);
    try {
      const template = await loadStarterTemplate(templateKey);
      const dependencyRefs: string[] = [];
      const bundleFiles = { ...template.bundleFiles };

      for (const dependency of template.manifest.templateDependencies) {
        const dependencyRef = await materializeTemplate(
          dependency.templateKey,
          dependency.templateKey.split("/").pop() ?? dependency.templateKey,
        );
        dependencyRefs.push(dependencyRef);

        if (bundleFiles[dependency.localStubPath] != null) {
          throw new Error(
            `Starter template ${templateKey} already defines ${dependency.localStubPath}; cannot synthesize stub for dependency ${dependency.templateKey}`,
          );
        }

        bundleFiles[dependency.localStubPath] = buildTemplateDependencyStub({
          dependencyRef,
        });
      }

      const payload = buildRegistryResourcePayloadFromStarterTemplate({
        manifest: template.manifest,
        bundleFiles,
        registryDependencies: dependencyRefs,
      });
      const declaredDependencies = payload.declaredDependencies;
      const discoveredThirdPartyDependencies =
        payload.type === "registry:theme"
          ? []
          : Array.from(
              new Set(
                Object.values(payload.files).flatMap((source) =>
                  extractDependencies(source).filter(
                    (specifier) =>
                      !isRelativeImport(specifier) && !specifier.startsWith("/"),
                  ),
                ),
              ),
            ).sort();
      const dependencyDecisions = evaluateThirdPartyDependencies({
        discovered: excludeExplicitRegistryDependencies(
          discoveredThirdPartyDependencies,
          dependencyRefs,
        ),
        declared: declaredDependencies,
      });

      const itemName = templateKey.split("/").pop() ?? fallbackName;
      const item = await createRegistryItem({
        name: itemName,
        type: payload.type,
        title: payload.title,
        description: payload.description,
        files: payload.files,
        userId: params.project.ownerUserId ?? null,
        organizationId: params.project.organizationId ?? null,
        canonicalProjectId: params.project.id,
        canonicalProjectKey: params.project.namespaceKey,
        visibility: params.project.visibility === "private" ? "private" : "public",
        registryDependencies: payload.registryDependencies,
        declaredDependencies,
        dependencyDecisions,
        previewProps: payload.previewProps,
        previewExport: payload.previewExport,
        previewStories: payload.previewStories,
        previewDefaultStoryId: payload.previewDefaultStoryId,
        requestUserId: params.requestUserId,
      });

      const ref = `@${ownerRef}/${params.project.namespaceKey}/${item.name}`;
      createdRefsByTemplateKey.set(templateKey, ref);
      createdItems.push(item.name);
      return ref;
    } finally {
      pendingTemplateKeys.delete(templateKey);
    }
  }

  for (const resource of initialization.starterKit.defaultInstall.resources) {
    const ref = await materializeTemplate(resource.source.templateKey, resource.key);
    if (resource.type === "registry:theme") {
      materializedThemeRefs.push(ref);
    }
  }

  const defaultThemeResourceRefs =
    materializedThemeRefs.length > 0
      ? materializedThemeRefs
      : initialization.defaultThemeResourceRefs;

  if (defaultThemeResourceRefs.length > 0) {
    await db
      .update(registryProjects)
      .set({
        defaultThemeResourceRefs,
        defaultThemeResourceRef: defaultThemeResourceRefs[0] ?? null,
        updatedAt: new Date(),
      })
      .where(eq(registryProjects.id, params.project.id));
  }

  return {
    starterKit: initialization.starterKit.id,
    createdItems,
    defaultThemeResourceRefs,
  };
}

function buildTemplateDependencyStub(params: { dependencyRef: string }): string {
  const parsed = parseRegistryDependencyRef(params.dependencyRef);
  if (!parsed) {
    throw new Error(`Invalid starter template dependency ref: ${params.dependencyRef}`);
  }
  return `// auto-generated by cozy registry. do not edit.\nexport * from "${params.dependencyRef}";\n`;
}
