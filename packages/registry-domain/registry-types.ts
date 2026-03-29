export const REGISTRY_BLOCK_TYPE = "registry:block" as const;
export const REGISTRY_UI_TYPE = "registry:ui" as const;
export const REGISTRY_THEME_TYPE = "registry:theme" as const;
export const LEGACY_REGISTRY_COMPONENT_TYPE = "registry:component" as const;

export type CanonicalRegistryItemType =
  | typeof REGISTRY_BLOCK_TYPE
  | typeof REGISTRY_UI_TYPE
  | typeof REGISTRY_THEME_TYPE;

export type SupportedRegistryItemType =
  | CanonicalRegistryItemType
  | typeof LEGACY_REGISTRY_COMPONENT_TYPE;

export function normalizeRegistryItemType(type: string): CanonicalRegistryItemType | string {
  if (type === LEGACY_REGISTRY_COMPONENT_TYPE) {
    return REGISTRY_UI_TYPE;
  }
  return type;
}

export function isRegistryThemeType(type: string): boolean {
  return normalizeRegistryItemType(type) === REGISTRY_THEME_TYPE;
}

export function isRegistryUiType(type: string): boolean {
  return normalizeRegistryItemType(type) === REGISTRY_UI_TYPE;
}

export function getRegistryItemTypeLabel(type: string): string {
  const normalized = normalizeRegistryItemType(type);
  if (normalized === REGISTRY_BLOCK_TYPE) return "Block";
  if (normalized === REGISTRY_UI_TYPE) return "UI";
  if (normalized === REGISTRY_THEME_TYPE) return "Theme";
  return normalized.replace("registry:", "");
}

