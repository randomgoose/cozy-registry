import { getPlatformBaseUrl } from "./runtime-config";

export type RegistryCatalogItem = {
  name: string;
  type: string;
  title: string;
  description?: string | null;
};

export type RegistryCatalog = {
  $schema: string;
  name: string;
  homepage: string;
  items: RegistryCatalogItem[];
};

export type OwnedRegistryItem = {
  id: string;
  ownerHandle: string | null;
  userId: string | null;
  teamId?: string | null;
  orgSlug?: string | null;
  teamSlug?: string | null;
  teamName?: string | null;
  name: string;
  type: string;
  title: string;
  description: string | null;
  visibility: string;
  currentVersion?: string | null;
  meta: Record<string, unknown> | null;
};

export type WorkspaceData = {
  activeOrganizationId: string | null;
  role: string | null;
  workspace: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    logo?: string | null;
  } | null;
  teams: Array<{
    id: string;
    name: string;
    slug: string | null;
    createdAt: string;
  }>;
  members: Array<{
    memberId: string;
    id: string;
    name: string | null;
    email: string;
    role: string;
    image?: string | null;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    status: string;
    teamId: string | null;
    teamName: string | null;
    createdAt: string;
    expiresAt: string;
  }>;
};

export type Collection = {
  id: string;
  ownerUserId?: string | null;
  ownerTeamId?: string | null;
  slug: string;
  title: string;
  description: string | null;
  visibility: "public" | "private";
  createdAt?: string;
  updatedAt?: string;
  itemCount?: number;
};

export type CollectionItem = {
  itemId: string;
  name: string;
  title: string;
  type: string;
  description?: string | null;
  visibility: string;
  addedAt: string;
};

export type RegistryItemMeta = {
  name: string;
  ownerUserId?: string | null;
  title: string;
  description: string | null;
  type: string;
  visibility: string;
};

export type RegistryVersions = {
  currentVersion: string;
  versions: Array<{
    version: string;
    createdAt: string;
    createdBy: string | null;
    message: string | null;
  }>;
};

export type RegistryInstallPayload = {
  name: string;
  type: string;
  title?: string;
  description?: string;
  dependencies?: string[];
  registryDependencies?: string[];
  files: Array<{
    path: string;
    content: string;
    type?: string;
  }>;
  meta?: Record<string, unknown>;
};

export type TeamCollaboration = {
  activeOrganizationId: string | null;
  activeTeamId: string | null;
  role: string | null;
  team: {
    id: string;
    name: string;
    organizationId: string;
    organizationName: string;
  } | null;
  members: Array<{
    memberId: string;
    id: string;
    name: string;
    email: string;
    image?: string | null;
    role: string;
    joinedAt: string;
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: string;
    status: string;
    createdAt: string;
    expiresAt: string;
  }>;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export async function fetchRegistryCatalog(signal?: AbortSignal) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl}/registry`, {
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch registry catalog: ${response.status}`);
  }

  return (await response.json()) as RegistryCatalog;
}

export async function fetchRegistryLookup(name: string, signal?: AbortSignal) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const response = await fetch(
    `${baseUrl}/registry/lookup?name=${encodeURIComponent(name)}`,
    {
      credentials: "include",
      signal,
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to lookup registry item: ${response.status}`);
  }

  return (await response.json()) as { owner: string; name: string };
}

export async function fetchRegistryItemMeta(
  owner: string,
  name: string,
  signal?: AbortSignal,
) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl}/registry/${owner}/${name}`, {
    credentials: "include",
    signal,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch registry item meta: ${response.status}`);
  }

  return (await response.json()) as RegistryItemMeta;
}

export async function deleteRegistryItem(
  owner: string,
  name: string,
  signal?: AbortSignal,
) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    throw new Error("Missing VITE_COZY_PLATFORM_BASE_URL");
  }

  const response = await fetch(`${baseUrl}/registry/${owner}/${name}`, {
    method: "DELETE",
    credentials: "include",
    signal,
  });

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { response, data };
}

export async function updateRegistryVisibility(
  owner: string,
  name: string,
  visibility: "public" | "private",
  signal?: AbortSignal,
) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    throw new Error("Missing VITE_COZY_PLATFORM_BASE_URL");
  }

  const response = await fetch(`${baseUrl}/registry/${owner}/${name}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ visibility }),
    signal,
  });

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { response, data };
}

export async function fetchRegistryItemVersions(
  owner: string,
  name: string,
  signal?: AbortSignal,
) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl}/registry/${owner}/${name}/versions`, {
    credentials: "include",
    signal,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch registry versions: ${response.status}`);
  }

  return (await response.json()) as RegistryVersions;
}

export async function fetchRegistryInstallPayload(
  owner: string,
  name: string,
  version?: string | null,
  signal?: AbortSignal,
) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const search = version ? `?v=${encodeURIComponent(version)}` : "";
  const response = await fetch(`${baseUrl}/r/${owner}/${name}${search}`, {
    credentials: "include",
    signal,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch install payload: ${response.status}`);
  }

  return (await response.json()) as RegistryInstallPayload;
}

export async function fetchOwnedRegistryItems(signal?: AbortSignal) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl}/registry/owned`, {
    credentials: "include",
    signal,
  });

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch owned registry items: ${response.status}`);
  }

  const data = (await response.json()) as { items: OwnedRegistryItem[] };
  return data.items;
}

export async function fetchCurrentWorkspace(signal?: AbortSignal) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl}/workspace/current`, {
    credentials: "include",
    signal,
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch workspace: ${response.status}`);
  }

  return (await response.json()) as WorkspaceData;
}

export async function fetchCollections(signal?: AbortSignal) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl}/collections`, {
    credentials: "include",
    signal,
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch collections: ${response.status}`);
  }

  const data = (await response.json()) as { collections: Collection[] };
  return data.collections;
}

export async function createCollection(
  body: {
    slug: string;
    title: string;
    description?: string | null;
    visibility?: "public" | "private";
  },
  signal?: AbortSignal,
) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    throw new Error("Missing VITE_COZY_PLATFORM_BASE_URL");
  }

  const response = await fetch(`${baseUrl}/collections`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { response, data };
}

export async function updateCollection(
  id: string,
  body: {
    slug?: string;
    title?: string;
    description?: string | null;
    visibility?: "public" | "private";
  },
  signal?: AbortSignal,
) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    throw new Error("Missing VITE_COZY_PLATFORM_BASE_URL");
  }

  const response = await fetch(`${baseUrl}/collections/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { response, data };
}

export async function deleteCollection(id: string, signal?: AbortSignal) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    throw new Error("Missing VITE_COZY_PLATFORM_BASE_URL");
  }

  const response = await fetch(`${baseUrl}/collections/${id}`, {
    method: "DELETE",
    credentials: "include",
    signal,
  });

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { response, data };
}

export async function fetchCollectionItems(id: string, signal?: AbortSignal) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl}/collections/${id}/items`, {
    credentials: "include",
    signal,
  });

  if (response.status === 401 || response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch collection items: ${response.status}`);
  }

  const data = (await response.json()) as { items: CollectionItem[] };
  return data.items;
}

export async function removeItemFromCollection(
  collectionId: string,
  itemId: string,
  signal?: AbortSignal,
) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    throw new Error("Missing VITE_COZY_PLATFORM_BASE_URL");
  }

  const response = await fetch(`${baseUrl}/collections/${collectionId}/items/${itemId}`, {
    method: "DELETE",
    credentials: "include",
    signal,
  });

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { response, data };
}

export async function publishRegistryItem(
  body: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    throw new Error("Missing VITE_COZY_PLATFORM_BASE_URL");
  }

  const response = await fetch(`${baseUrl}/registry/items`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return { response, data };
}

export async function fetchCurrentTeamCollaboration(signal?: AbortSignal) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl}/team/current/collaboration`, {
    credentials: "include",
    signal,
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch team collaboration: ${response.status}`);
  }

  return (await response.json()) as TeamCollaboration;
}

export async function fetchNotifications(signal?: AbortSignal) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    return null;
  }

  const response = await fetch(`${baseUrl}/notifications`, {
    credentials: "include",
    signal,
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch notifications: ${response.status}`);
  }

  return (await response.json()) as {
    notifications: NotificationItem[];
    unreadCount: number;
  };
}

export async function markNotificationReadById(id: string, signal?: AbortSignal) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    throw new Error("Missing VITE_COZY_PLATFORM_BASE_URL");
  }

  const response = await fetch(`${baseUrl}/notifications/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ read: true }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to mark notification as read: ${response.status}`);
  }
}

export async function markAllNotificationsRead(signal?: AbortSignal) {
  const baseUrl = getPlatformBaseUrl();

  if (!baseUrl) {
    throw new Error("Missing VITE_COZY_PLATFORM_BASE_URL");
  }

  const response = await fetch(`${baseUrl}/notifications/mark-all-read`, {
    method: "POST",
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to mark all notifications as read: ${response.status}`);
  }
}
