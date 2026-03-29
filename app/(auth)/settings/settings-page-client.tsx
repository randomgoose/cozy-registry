"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import {
  REGISTRY_BLOCK_TYPE,
  REGISTRY_THEME_TYPE,
  REGISTRY_UI_TYPE,
  normalizeRegistryItemType,
} from "@/lib/registry-types";

export function SettingsPageClient() {
  const [session, setSession] = useState<{
    user: { id?: string; name?: string; email?: string };
    session?: { activeOrganizationId?: string | null };
  } | null>(null);
  const [apiKeys, setApiKeys] = useState<Array<{ id: string; name?: string | null; start?: string | null }>>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [projects, setProjects] = useState<Array<{ id: string; slug: string; title: string }>>([]);
  const [policyKeyId, setPolicyKeyId] = useState<string | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [policy, setPolicy] = useState<{
    allowedProjectIds: string[];
    allowedTypes: string[];
    allowPublicOutsideProjects: boolean;
  } | null>(null);
  const isOrgScope = !!session?.session?.activeOrganizationId;
  const [orgCollab, setOrgCollab] = useState<{
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
  } | null>(null);
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

  return (
    <>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Settings
      </h1>
      <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
        Current scope: {isOrgScope ? "Organization" : "Personal"}
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          API Tokens
        </h2>
        {isOrgScope ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            API keys are still user-owned. The scope policy you edit below will apply to the projects and item types in your currently active organization scope.
          </p>
        ) : null}

        {newKey && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Your new token is ready. Copy it now and store it somewhere safe. It will only be shown once.
            </p>
            <code className="mt-2 block break-all rounded bg-amber-100 px-2 py-2 font-mono text-sm dark:bg-amber-900/50">
              {newKey}
            </code>
            <button
              type="button"
              onClick={() => setNewKey(null)}
              className="mt-2 text-sm text-amber-700 hover:underline dark:text-amber-300"
            >
              Dismiss
            </button>
          </div>
        )}

        <form onSubmit={handleCreateKey} className="mt-4 flex gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Token name, for example Cursor or Figma Make"
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {creating ? "Creating..." : "Create token"}
          </button>
        </form>

        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading...</p>
        ) : apiKeys.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {apiKeys.map((key) => (
              <li
                key={key.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <div>
                  <span className="font-medium">{key.name || "Untitled token"}</span>
                  {key.start && (
                    <span className="ml-2 font-mono text-xs text-zinc-500">
                      {key.start}...
                    </span>
                  )}
                  <div className="mt-1 text-xs text-zinc-500">
                    Scope controls let you limit which projects and item types this token can access in the current {isOrgScope ? "organization" : "personal"} scope.
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openPolicy(key.id)}
                    className="text-sm text-zinc-700 hover:underline dark:text-zinc-300"
                  >
                    Edit scope
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteKey(key.id)}
                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-zinc-500">No tokens yet.</p>
        )}
      </section>

      {isOrgScope ? (
        <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Organization
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              You are working in an organization scope. Use{" "}
              <Link
                href="/workspace"
                className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
              >
                Organizations
              </Link>{" "}
              for an overview, or open this workspace’s items and settings from the sidebar.
            </p>
          </div>

          {orgCollabLoading ? (
            <p className="mt-4 text-sm text-zinc-500">Loading...</p>
          ) : orgCollab?.organization ? (
            <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    Name
                  </div>
                  <div className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {orgCollab.organization.name}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">@{orgCollab.organization.slug}</div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                    Your role
                  </div>
                  <div className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {orgCollab.role ?? "viewer"}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              Organization details are unavailable right now.
            </p>
          )}
        </section>
      ) : null}

      {isOrgScope ? (
        <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Organization members
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Manage who belongs to this organization, adjust roles, and review pending invitations.
              </p>
            </div>
            {orgCollab?.organization ? (
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                @{orgCollab.organization.slug}
              </span>
            ) : null}
          </div>

          {orgCollabLoading ? (
            <p className="mt-4 text-sm text-zinc-500">Loading...</p>
          ) : orgCollab ? (
            <>
              {orgCollab.role === "owner" ? (
                <form onSubmit={handleInviteMember} className="mt-5 flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Invite member
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@example.com"
                      className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button
                      type="submit"
                      disabled={inviting || !inviteEmail.trim()}
                      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                    >
                      {inviting ? "Inviting..." : "Send invite"}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-400">
                  Only organization owners can send invitations in this MVP.
                </p>
              )}

              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Members
                  </div>
                  {orgCollab.members.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">No members yet.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {orgCollab.members.map((member) => (
                        <li
                          key={member.id}
                          className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/40"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                {member.name || member.email}
                              </div>
                              <div className="mt-1 text-xs text-zinc-500">{member.email}</div>
                              <div className="mt-2 inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                                {member.role}
                              </div>
                            </div>
                            {orgCollab.role === "owner" ? (
                              <div className="flex shrink-0 items-center gap-2">
                                {member.role === "owner" ? null : (
                                  <>
                                    <select
                                      value={member.role}
                                      disabled={memberActionId === member.memberId}
                                      onChange={(e) => {
                                        const nextRole = e.target.value;
                                        if (nextRole !== member.role) {
                                          void handleUpdateMemberRole(member.memberId, nextRole);
                                        }
                                      }}
                                      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                                    >
                                      <option value="viewer">Viewer</option>
                                      <option value="editor">Editor</option>
                                    </select>
                                  </>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Pending invitations
                  </div>
                  {orgCollab.invitations.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">No pending invitations.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {orgCollab.invitations.map((invitation) => (
                        <li
                          key={invitation.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/40"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                              {invitation.email}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {invitation.role}
                            </div>
                          </div>
                          {orgCollab.role === "owner" ? (
                            <button
                              type="button"
                              onClick={() => handleCancelInvitation(invitation.id)}
                              className="text-sm text-red-600 hover:underline dark:text-red-400"
                            >
                              Cancel
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">
              Organization collaboration details are unavailable right now.
            </p>
          )}
        </section>
      ) : null}

        {policyKeyId && (
          <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Token scope
              </h2>
              <button
                type="button"
                onClick={() => {
                  setPolicyKeyId(null);
                  setPolicy(null);
                }}
                className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
              >
                Close
              </button>
            </div>

            {policyLoading || !policy ? (
              <p className="mt-3 text-sm text-zinc-500">Loading...</p>
            ) : (
              <div className="mt-4 space-y-6">
                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Allowed item types
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm">
                    {[REGISTRY_BLOCK_TYPE, REGISTRY_UI_TYPE, REGISTRY_THEME_TYPE].map((t) => (
                      <label key={t} className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={policy.allowedTypes.includes(t)}
                          onChange={(e) => {
                            setPolicy((p) => {
                              if (!p) return p;
                              const next = new Set(p.allowedTypes);
                              if (e.target.checked) next.add(t);
                              else next.delete(t);
                              return { ...p, allowedTypes: Array.from(next) };
                            });
                          }}
                        />
                        {t}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Allowed projects
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    This token will only list and retrieve items from these projects unless public access below is enabled.
                  </p>
                  {projects.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-500">
                      No projects yet. Create one from the Projects page for this workspace (or under Personal).
                    </p>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {projects.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <input
                            type="checkbox"
                            checked={policy.allowedProjectIds.includes(c.id)}
                            onChange={(e) => {
                              setPolicy((p) => {
                                if (!p) return p;
                                const next = new Set(p.allowedProjectIds);
                                if (e.target.checked) next.add(c.id);
                                else next.delete(c.id);
                                return { ...p, allowedProjectIds: Array.from(next) };
                              });
                            }}
                          />
                          <span className="truncate">{c.title}</span>
                          <span className="text-xs text-zinc-500">({c.slug})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={policy.allowPublicOutsideProjects}
                      onChange={(e) => setPolicy((p) => (p ? { ...p, allowPublicOutsideProjects: e.target.checked } : p))}
                    />
                    Allow access to public items outside the selected projects
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={policySaving}
                    onClick={savePolicy}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    {policySaving ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={policySaving}
                    onClick={clearPolicy}
                    className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
                  >
                    Clear restrictions
                  </button>
                  <span className="text-xs text-zinc-500">
                    MCP clients and AI tools using this token will be restricted to the scope configured here.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

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
    </>
  );
}
