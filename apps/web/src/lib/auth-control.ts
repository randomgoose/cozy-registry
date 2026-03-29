import { getPlatformBaseUrl } from "./runtime-config";

type SearchParams = Record<string, string | number | boolean | null | undefined>;

function requirePlatformBaseUrl() {
  const baseUrl = getPlatformBaseUrl();
  if (!baseUrl) {
    throw new Error("Missing VITE_COZY_PLATFORM_BASE_URL");
  }
  return baseUrl;
}

function buildUrl(path: string, searchParams?: SearchParams) {
  const url = new URL(
    path.startsWith("/") ? path : `/${path}`,
    requirePlatformBaseUrl(),
  );

  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === null || typeof value === "undefined") continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function resolveCallbackUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (typeof window === "undefined") {
    return path;
  }

  return new URL(path.startsWith("/") ? path : `/${path}`, window.location.origin).toString();
}

async function parseJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

function getErrorMessage(
  data: Record<string, unknown> | null,
  fallback: string,
) {
  if (typeof data?.message === "string" && data.message) {
    return data.message;
  }
  if (typeof data?.error === "string" && data.error) {
    return data.error;
  }
  return fallback;
}

export async function fetchWorkspaceScopeContext() {
  const response = await fetch(buildUrl("/auth-control/workspace/context"), {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to load workspace context (${response.status})`);
  }

  return parseJson<{
    userId: string;
    workspace: {
      organizations: Array<{
        id: string;
        name: string;
        slug: string;
        role: string;
        teams: Array<{
          id: string;
          name: string;
          slug: string | null;
          organizationId: string;
          isActive: boolean;
        }>;
        isActive: boolean;
      }>;
      activeOrganizationId: string | null;
      activeTeamId: string | null;
      activeOrganization: {
        id: string;
        name: string;
        slug: string;
        role: string;
      } | null;
      activeTeam: {
        id: string;
        name: string;
        slug: string | null;
        organizationId: string;
        isActive: boolean;
      } | null;
    };
  }>(response);
}

export async function fetchAuthControlSession() {
  const response = await fetch(buildUrl("/auth-control/session"), {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Failed to load session (${response.status})`);
  }

  return parseJson<{
    user: {
      id: string;
      email: string | null;
      name: string | null;
      image: string | null;
    } | null;
    session: {
      activeOrganizationId: string | null;
      activeTeamId: string | null;
    } | null;
  }>(response);
}

export async function fetchTeamRouteResolution(orgSlug: string, teamSlug: string) {
  const response = await fetch(
    buildUrl("/auth-control/team/resolve", { orgSlug, teamSlug }),
    {
      credentials: "include",
    },
  );

  if (response.status === 401) {
    return { kind: "signed-out" as const };
  }

  if (response.status === 403 || response.status === 404) {
    return { kind: "not-found" as const };
  }

  if (!response.ok) {
    throw new Error(`Failed to resolve team route: ${response.status}`);
  }

  return {
    kind: "resolved" as const,
    data: await parseJson<{
      organizationId: string;
      organizationName: string;
      orgSlug: string;
      teamId: string;
      teamName: string;
      teamSlug: string | null;
      isWorkspaceSynced: boolean;
    }>(response),
  };
}

export async function postAuthControl(
  path: string,
  body: Record<string, unknown>,
) {
  const response = await fetch(buildUrl(`/auth-control${path}`), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(body),
  });

  const data = await parseJson<Record<string, unknown>>(response);
  return { response, data };
}

export async function signInWithEmail(args: {
  email: string;
  password: string;
  callbackURL: string;
}) {
  const normalizedCallbackURL = resolveCallbackUrl(args.callbackURL);
  return postAuthControl("/sign-in/email", {
    email: args.email,
    password: args.password,
    callbackURL: normalizedCallbackURL,
  });
}

export async function signUpWithEmail(args: {
  name: string;
  email: string;
  password: string;
  callbackURL: string;
}) {
  const normalizedCallbackURL = resolveCallbackUrl(args.callbackURL);
  return postAuthControl("/sign-up/email", {
    name: args.name,
    email: args.email,
    password: args.password,
    callbackURL: normalizedCallbackURL,
  });
}

export async function startSocialSignIn(args: {
  provider: "google" | "figma";
  callbackURL: string;
}) {
  const { response, data } = await postAuthControl("/sign-in/social", {
    provider: args.provider,
    callbackURL: resolveCallbackUrl(args.callbackURL),
    disableRedirect: true,
  });

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Failed to start social sign-in"));
  }

  if (typeof data?.url !== "string" || !data.url) {
    throw new Error("Social sign-in did not return a redirect URL");
  }

  window.location.assign(data.url);
}

export async function fetchAuthControlMe() {
  const response = await fetch(buildUrl("/auth-control/me"), {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to load account profile (${response.status})`);
  }

  return parseJson<{
    user: {
      id: string;
      email: string;
      name: string | null;
      handle: string | null;
    } | null;
  }>(response);
}

export async function updateAuthControlHandle(handle: string) {
  return postAuthControl("/me/handle", { handle });
}

export async function fetchApiKeys(organizationId?: string | null) {
  const response = await fetch(
    buildUrl("/auth-control/api-key/list", {
      organizationId: organizationId ?? undefined,
    }),
    {
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to load API keys (${response.status})`);
  }

  return parseJson<{
    apiKeys?: Array<{
      id: string;
      name: string | null;
      prefix: string | null;
      start: string | null;
      createdAt: string;
      expiresAt: string | null;
      enabled: boolean;
    }>;
  }>(response);
}
