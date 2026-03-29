import { and, count, desc, eq, isNull } from "drizzle-orm";

import { db } from "@cozy/db";
import { team, user, userNotification } from "@cozy/db/schema";

const INVITATION_TYPE = "organization_invitation";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function inviterLabel(inviter: { name?: string | null; email?: string | null }): string {
  return inviter.name?.trim() || inviter.email?.trim() || "Someone";
}

/**
 * After an org/team invitation is created: if the invitee email matches an existing user,
 * store an in-app notification so they can accept without relying on email delivery.
 */
export async function createInvitationInAppNotification(input: {
  invitation: {
    id: string;
    email: string;
    role: string;
    teamId?: string | null;
  };
  inviter: { id: string; name?: string | null; email?: string | null };
  organization: { id: string; name: string };
}): Promise<void> {
  const email = normalizeEmail(input.invitation.email);
  const [recipient] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!recipient || recipient.id === input.inviter.id) return;

  const rawTeam = input.invitation.teamId?.trim();
  let teamName: string | null = null;
  if (rawTeam) {
    const firstTeamId = rawTeam.split(",")[0]?.trim();
    if (firstTeamId) {
      const [row] = await db
        .select({ name: team.name })
        .from(team)
        .where(eq(team.id, firstTeamId))
        .limit(1);
      teamName = row?.name ?? null;
    }
  }

  const orgName = input.organization.name;
  const label = inviterLabel(input.inviter);
  const title = teamName
    ? `${label} invited you to ${teamName}`
    : `${label} invited you to ${orgName}`;

  const body = `${orgName} · ${input.invitation.role}`;

  try {
    await db
      .insert(userNotification)
      .values({
        userId: recipient.id,
        type: INVITATION_TYPE,
        title,
        body,
        actionUrl: `/accept-invitation?invitationId=${encodeURIComponent(input.invitation.id)}`,
        referenceId: input.invitation.id,
      })
      .onConflictDoNothing({
        target: [userNotification.userId, userNotification.referenceId],
      });
  } catch (err) {
    console.warn(
      "[user-notifications] Failed to insert invitation notification:",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function markInvitationNotificationsRead(
  userId: string,
  invitationId: string,
): Promise<void> {
  await db
    .update(userNotification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(userNotification.userId, userId),
        eq(userNotification.referenceId, invitationId),
        eq(userNotification.type, INVITATION_TYPE),
      ),
    );
}

export type UserNotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export async function listNotificationsForUser(
  userId: string,
  limit = 40,
): Promise<UserNotificationRow[]> {
  const rows = await db
    .select({
      id: userNotification.id,
      type: userNotification.type,
      title: userNotification.title,
      body: userNotification.body,
      actionUrl: userNotification.actionUrl,
      readAt: userNotification.readAt,
      createdAt: userNotification.createdAt,
    })
    .from(userNotification)
    .where(eq(userNotification.userId, userId))
    .orderBy(desc(userNotification.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    actionUrl: r.actionUrl,
    readAt: r.readAt,
    createdAt: r.createdAt,
  }));
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(userNotification)
    .where(and(eq(userNotification.userId, userId), isNull(userNotification.readAt)));

  return Number(row?.n ?? 0);
}

export async function markNotificationRead(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const [updated] = await db
    .update(userNotification)
    .set({ readAt: new Date() })
    .where(
      and(eq(userNotification.id, notificationId), eq(userNotification.userId, userId)),
    )
    .returning({ id: userNotification.id });

  return !!updated;
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db
    .update(userNotification)
    .set({ readAt: new Date() })
    .where(and(eq(userNotification.userId, userId), isNull(userNotification.readAt)));
}
