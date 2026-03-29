function trimTrailingSlash(value: string) {
  return value.replace(/\/$/, "");
}

export function getPlatformBaseUrl() {
  const value = import.meta.env.VITE_COZY_PLATFORM_BASE_URL?.trim();
  if (value) {
    return trimTrailingSlash(value);
  }

  if (import.meta.env.DEV) {
    return "http://localhost:3000";
  }

  return null;
}
