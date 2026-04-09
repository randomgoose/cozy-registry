export type SettingsSession = {
  user: { id?: string; name?: string; email?: string };
  session?: { activeOrganizationId?: string | null };
};

export type ApiKeyItem = {
  id: string;
  name?: string | null;
  start?: string | null;
};

export type SettingsProject = {
  id: string;
  slug: string;
  title: string;
};

export type TokenPolicy = {
  allowedProjectIds: string[];
  allowedTypes: string[];
  allowPublicOutsideProjects: boolean;
};

export type OrganizationCollaboration = {
  role: string | null;
  organization: { id: string; name: string; slug: string } | null;
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
