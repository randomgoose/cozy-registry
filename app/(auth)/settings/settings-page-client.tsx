"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PageContentShell } from "@/app/components/PageContentShell";
import { authClient } from "@/lib/auth-client";
import { MembersSettingsSection } from "./components/MembersSettingsSection";
import { OrganizationSettingsSection } from "./components/OrganizationSettingsSection";
import { TokensSettingsSection } from "./components/TokensSettingsSection";
import {
  REGISTRY_BLOCK_TYPE,
  REGISTRY_THEME_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";
import type {
  ApiKeyItem,
  OrganizationCollaboration,
  SettingsProject,
  SettingsSession,
  TokenPolicy,
} from "./types";

export function SettingsPageClient({ section }: { section?: string | null } = {}) {
  const [session, setSession] = useState<SettingsSession | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [projects, setProjects] = useState<SettingsProject[]>([]);
  const [policyKeyId, setPolicyKeyId] = useState<string | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [policy, setPolicy] = useState<TokenPolicy | null>(null);
  const isOrgScope = !!session?.session?.activeOrganizationId;
  const [orgCollab, setOrgCollab] = useState<OrganizationCollaboration | null>(null);
  const [orgCollabLoading, setOrgCollabLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviting, setInviting] = useState(false);
  const [memberActionId, setMemberActionId] = useState<string | null>(null);

  useEffect(() => {
    authClient.getSession().then(({ data }) => setSession(data ?? null));
  }, []);

  useEffect(() => {
    if (!session) return;
    authClient.apiKey.list().then(({ data }) => {
      if (data?.apiKeys) setApiKeys(data.apiKeys);
      setLoading(false);
    });
  }, [session]);

  useEffect(() => {
    if (!session) return;
    fetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        const cols = (data?.projects ?? []) as Array<{ id: string; slug: string; title: string }>;
        setProjects(cols);
      })
      .catch(() => {});
  }, [session]);

  useEffect(() => {
    if (!session || !isOrgScope) {
      setOrgCollab(null);
      return;
    }

    setOrgCollabLoading(true);
    fetch("/api/organization/current/collaboration", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setOrgCollab(data ?? null);
      })
      .catch(() => {
        setOrgCollab(null);
      })
      .finally(() => {
        setOrgCollabLoading(false);
      });
  }, [session, isOrgScope]);

  async function openPolicy(keyId: string) {
    setPolicyKeyId(keyId);
    setPolicyLoading(true);
    try {
      const res = await fetch(`/api/apikeys/${keyId}/policy`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as
        | {
            policy:
              | {
                  allowedProjectIds?: unknown;
                  allowedTypes?: unknown;
                  allowPublicOutsideProjects?: unknown;
                }
              | null;
          }
        | null;
      const p = data?.policy ?? null;
      setPolicy({
        allowedProjectIds: Array.isArray(p?.allowedProjectIds)
          ? (p.allowedProjectIds as string[])
          : [],
        allowedTypes: Array.isArray(p?.allowedTypes)
          ? Array.from(
              new Set(
                (p.allowedTypes as string[]).map((value) =>
                  normalizeRegistryItemType(value),
                ),
              ),
            )
          : [REGISTRY_BLOCK_TYPE, REGISTRY_THEME_TYPE],
        allowPublicOutsideProjects: !!p?.allowPublicOutsideProjects,
      });
    } finally {
      setPolicyLoading(false);
    }
  }

  async function savePolicy() {
    if (!policyKeyId || !policy) return;
    setPolicySaving(true);
    try {
      const res = await fetch(`/api/apikeys/${policyKeyId}/policy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(err?.error ?? "Failed to save policy");
        return;
      }
      setPolicyKeyId(null);
      setPolicy(null);
    } finally {
      setPolicySaving(false);
    }
  }

  async function clearPolicy() {
    if (!policyKeyId) return;
    if (
      !confirm(
        "Clear the scope restrictions for this token? It will revert to the default access policy.",
      )
    )
      return;
    setPolicySaving(true);
    try {
      const res = await fetch(`/api/apikeys/${policyKeyId}/policy`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        alert(err?.error ?? "Failed to clear policy");
        return;
      }
      // Reset UI to "unrestricted"
      setPolicy(null);
      setPolicyKeyId(null);
    } finally {
      setPolicySaving(false);
    }
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await authClient.apiKey.create({
        name: newKeyName.trim(),
      });
      if (error) {
        alert(error.message ?? "Failed to create key");
        return;
      }
      if (data?.key) {
        setNewKey(data.key);
        setNewKeyName("");
        if (data.id) {
          setApiKeys((prev) => [...prev, { id: data.id, name: data.name ?? null, start: data.start ?? null }]);
        }
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteKey(id: string) {
    if (!confirm("Delete this token? This action cannot be undone.")) return;
    const { error } = await authClient.apiKey.delete({ keyId: id });
    if (error) {
      alert(error.message ?? "Failed to delete");
      return;
    }
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
  }

  async function refreshOrgCollaboration() {
    if (!isOrgScope) return;
    setOrgCollabLoading(true);
    try {
      const response = await fetch("/api/organization/current/collaboration", {
        cache: "no-store",
      });
      const data = await response.json();
      setOrgCollab(data ?? null);
    } finally {
      setOrgCollabLoading(false);
    }
  }

  async function handleInviteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!orgCollab?.organization?.id || !inviteEmail.trim()) return;

    setInviting(true);
    try {
      const response = await fetch("/api/auth/organization/invite-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          organizationId: orgCollab.organization.id,
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => "");
        alert(message || "Failed to invite member");
        return;
      }

      setInviteEmail("");
      setInviteRole("viewer");
      await refreshOrgCollaboration();
    } finally {
      setInviting(false);
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    if (!confirm("Cancel this invitation?")) return;

    const response = await fetch("/api/auth/organization/cancel-invitation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ invitationId }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      alert(message || "Failed to cancel invitation");
      return;
    }

    await refreshOrgCollaboration();
  }

  async function handleUpdateMemberRole(memberId: string, role: string) {
    if (!orgCollab?.organization?.id) return;

    setMemberActionId(memberId);
    try {
      const response = await fetch("/api/auth/organization/update-member-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          memberId,
          role,
          organizationId: orgCollab.organization.id,
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => "");
        alert(message || "Failed to update member role");
        return;
      }

      await refreshOrgCollaboration();
    } finally {
      setMemberActionId(null);
    }
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
        <p className="text-zinc-600 dark:text-zinc-400">
          Please{" "}
          <Link href="/sign-in" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            sign in
          </Link>
        </p>
      </div>
    );
  }

  const activeSection =
    section === "members" && isOrgScope
      ? "members"
      : section === "organization" && isOrgScope
        ? "organization"
        : "tokens";

  return (
    <PageContentShell>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Settings
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Current scope: {isOrgScope ? "Organization" : "Personal"}
      </p>

      {activeSection === "tokens" ? (
        <TokensSettingsSection
          isOrgScope={isOrgScope}
          newKey={newKey}
          onDismissNewKey={() => setNewKey(null)}
          newKeyName={newKeyName}
          onNewKeyNameChange={setNewKeyName}
          creating={creating}
          onCreateKey={handleCreateKey}
          loading={loading}
          apiKeys={apiKeys}
          onOpenPolicy={openPolicy}
          onDeleteKey={handleDeleteKey}
          policyKeyId={policyKeyId}
          policyLoading={policyLoading}
          policy={policy}
          setPolicy={setPolicy}
          projects={projects}
          policySaving={policySaving}
          onSavePolicy={savePolicy}
          onClearPolicy={clearPolicy}
          onClosePolicy={() => {
            setPolicyKeyId(null);
            setPolicy(null);
          }}
        />
      ) : null}

      {isOrgScope && activeSection === "organization" ? (
        <OrganizationSettingsSection
          orgCollabLoading={orgCollabLoading}
          orgCollab={orgCollab}
        />
      ) : null}

      {isOrgScope && activeSection === "members" ? (
        <MembersSettingsSection
          orgCollabLoading={orgCollabLoading}
          orgCollab={orgCollab}
          inviteEmail={inviteEmail}
          onInviteEmailChange={setInviteEmail}
          inviteRole={inviteRole}
          onInviteRoleChange={setInviteRole}
          inviting={inviting}
          onInviteMember={handleInviteMember}
          memberActionId={memberActionId}
          onUpdateMemberRole={handleUpdateMemberRole}
          onCancelInvitation={handleCancelInvitation}
        />
      ) : null}

      <div className="mt-8">
        <button
          type="button"
          onClick={async () => {
            await authClient.signOut();
            window.location.href = "/";
          }}
          className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          Sign out
        </button>
      </div>
    </PageContentShell>
  );
}
