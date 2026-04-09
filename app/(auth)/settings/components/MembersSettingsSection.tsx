"use client";

import { Input } from "@/components/ui/input";
import type { OrganizationCollaboration } from "../types";

type MembersSettingsSectionProps = {
  orgCollabLoading: boolean;
  orgCollab: OrganizationCollaboration | null;
  inviteEmail: string;
  onInviteEmailChange: (value: string) => void;
  inviteRole: string;
  onInviteRoleChange: (value: string) => void;
  inviting: boolean;
  onInviteMember: (e: React.FormEvent) => void;
  memberActionId: string | null;
  onUpdateMemberRole: (memberId: string, role: string) => Promise<void>;
  onCancelInvitation: (invitationId: string) => Promise<void>;
};

export function MembersSettingsSection(props: MembersSettingsSectionProps) {
  const orgCollab = props.orgCollab;

  return (
    <section
      id="members"
      className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
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

      {props.orgCollabLoading ? (
        <p className="mt-4 text-sm text-zinc-500">Loading...</p>
      ) : orgCollab ? (
        <>
          {orgCollab.role === "owner" ? (
            <form
              onSubmit={props.onInviteMember}
              className="mt-5 flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-950/50"
            >
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                Invite member
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="email"
                  value={props.inviteEmail}
                  onChange={(e) => props.onInviteEmailChange(e.target.value)}
                  placeholder="teammate@example.com"
                  className="h-10 flex-1 rounded-lg text-sm md:text-sm"
                />
                <select
                  value={props.inviteRole}
                  onChange={(e) => props.onInviteRoleChange(e.target.value)}
                  className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button
                  type="submit"
                  disabled={props.inviting || !props.inviteEmail.trim()}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {props.inviting ? "Inviting..." : "Send invite"}
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
              <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Members</div>
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
                              <select
                                value={member.role}
                                disabled={props.memberActionId === member.memberId}
                                onChange={(e) => {
                                  const nextRole = e.target.value;
                                  if (nextRole !== member.role) {
                                    void props.onUpdateMemberRole(member.memberId, nextRole);
                                  }
                                }}
                                className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                              >
                                <option value="viewer">Viewer</option>
                                <option value="editor">Editor</option>
                              </select>
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
                        <div className="mt-1 text-xs text-zinc-500">{invitation.role}</div>
                      </div>
                      {orgCollab.role === "owner" ? (
                        <button
                          type="button"
                          onClick={() => void props.onCancelInvitation(invitation.id)}
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
  );
}
