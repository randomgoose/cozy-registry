function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

export function getPlatformBaseUrl() {
  const value = import.meta.env.VITE_COZY_PLATFORM_BASE_URL?.trim();
  return value ? trimTrailingSlash(value) : null;
}
