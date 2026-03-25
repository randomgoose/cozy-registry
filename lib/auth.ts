import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey } from "@better-auth/api-key";
import { nextCookies } from "better-auth/next-js";
import { organization as organizationPlugin } from "better-auth/plugins";
import { db } from "./db";
import * as schema from "./db/schema";
import { organizationAccessControl, organizationRoles } from "./auth-organization";
import { sendOrganizationInvitationEmail } from "./email/send-organization-invitation";
import {
  createInvitationInAppNotification,
  markInvitationNotificationsRead,
} from "./user-notifications";

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://*.vercel.app",
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      apiKey: schema.apiKey,
      apikey: schema.apiKey, // api-key plugin uses "apikey" as model name
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
      team: schema.team,
      teamMember: schema.teamMember,
    },
  }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
    figma: {
      clientId: process.env.FIGMA_CLIENT_ID as string,
      clientSecret: process.env.FIGMA_CLIENT_SECRET as string,
    },
  },
  plugins: [
    organizationPlugin({
      ac: organizationAccessControl,
      roles: organizationRoles,
      creatorRole: "owner",
      teams: {
        enabled: true,
        defaultTeam: { enabled: true },
      },
      sendInvitationEmail: async (data) => {
        await sendOrganizationInvitationEmail({
          id: data.id,
          role: data.role,
          email: data.email,
          organization: data.organization,
          inviter: data.inviter,
        });
      },
      organizationHooks: {
        afterCreateInvitation: async ({ invitation, inviter, organization }) => {
          try {
            await createInvitationInAppNotification({
              invitation: {
                id: invitation.id,
                email: invitation.email,
                role: invitation.role,
                teamId:
                  invitation.teamId !== undefined && invitation.teamId !== null
                    ? String(invitation.teamId)
                    : null,
              },
              inviter: {
                id: inviter.id,
                name: inviter.name,
                email: inviter.email,
              },
              organization: {
                id: organization.id,
                name: organization.name,
              },
            });
          } catch (err) {
            console.warn(
              "[auth] afterCreateInvitation in-app notification failed:",
              err instanceof Error ? err.message : err,
            );
          }
        },
        afterAcceptInvitation: async ({ invitation, user }) => {
          try {
            await markInvitationNotificationsRead(user.id, invitation.id);
          } catch (err) {
            console.warn(
              "[auth] afterAcceptInvitation notification update failed:",
              err instanceof Error ? err.message : err,
            );
          }
        },
      },
      schema: {
        session: {
          fields: {
            activeOrganizationId: "activeOrganizationId",
            activeTeamId: "activeTeamId",
          },
        },
        organization: { modelName: "organization" },
        member: { modelName: "member" },
        invitation: { modelName: "invitation" },
        team: { modelName: "team" },
        teamMember: { modelName: "teamMember" },
      },
    }),
    apiKey({
      defaultPrefix: "vbr_",
      apiKeyHeaders: ["x-api-key"],
      customAPIKeyGetter: (ctx) => {
        const req = ctx.request;
        if (!req) return null;
        const authHeader = req.headers.get("authorization");
        return extractBearerToken(authHeader) ?? req.headers.get("x-api-key");
      },
    }),
    nextCookies(),
  ],
});
