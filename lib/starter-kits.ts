export type ProjectCreateMode = "empty" | "primitives-kit";

export type StarterKitId = "primitives-kit";

export type StarterKitDefaultInstall = {
  defaultThemeResourceRefs: string[];
  foundations: string[];
  resources: StarterKitResourceBlueprint[];
};

export type StarterKitResourceBlueprint = {
  key: string;
  type: "registry:ui" | "registry:block" | "registry:theme";
  title: string;
  source: {
    kind: "repo-template";
    templateKey: string;
  };
};

export type StarterKitDefinition = {
  id: StarterKitId;
  createMode: Exclude<ProjectCreateMode, "empty">;
  title: string;
  shortTitle: string;
  description: string;
  defaultInstall: StarterKitDefaultInstall;
};

export type ProjectInitializationConfig = {
  createMode: ProjectCreateMode;
  starterKit: StarterKitDefinition | null;
  defaultThemeResourceRefs: string[];
};

const PRIMITIVES_KIT_DEFAULT_INSTALL: StarterKitDefaultInstall = {
  defaultThemeResourceRefs: [],
  foundations: ["Color tokens", "Typography tokens", "Radius tokens", "Spacing tokens"],
  resources: [
    {
      key: "cozy-default",
      type: "registry:theme",
      title: "Cozy Default Theme",
      source: { kind: "repo-template", templateKey: "themes/cozy-default" },
    },
    { key: "button", type: "registry:ui", title: "Button", source: { kind: "repo-template", templateKey: "primitives/button" } },
    { key: "dialog", type: "registry:ui", title: "Dialog", source: { kind: "repo-template", templateKey: "primitives/dialog" } },
  ],
};

export const PRIMITIVES_KIT: StarterKitDefinition = {
  id: "primitives-kit",
  createMode: "primitives-kit",
  title: "Primitives kit",
  shortTitle: "Primitives",
  description:
    "A small starter kit with core UI primitives and default Cozy theme layers for fast project setup.",
  defaultInstall: PRIMITIVES_KIT_DEFAULT_INSTALL,
};

export const STARTER_KITS = [PRIMITIVES_KIT] as const;

export function getStarterKitByCreateMode(
  createMode: ProjectCreateMode,
): StarterKitDefinition | null {
  if (createMode === "empty") return null;
  return STARTER_KITS.find((kit) => kit.createMode === createMode) ?? null;
}

export function getProjectInitializationConfig(
  createMode: ProjectCreateMode,
): ProjectInitializationConfig {
  const starterKit = getStarterKitByCreateMode(createMode);
  return {
    createMode,
    starterKit,
    defaultThemeResourceRefs: starterKit?.defaultInstall.defaultThemeResourceRefs ?? [],
  };
}

export function listStarterKitResourceTitlesByType(
  starterKit: StarterKitDefinition,
  type: StarterKitResourceBlueprint["type"],
): string[] {
  return starterKit.defaultInstall.resources
    .filter((resource) => resource.type === type)
    .map((resource) => resource.title);
}
