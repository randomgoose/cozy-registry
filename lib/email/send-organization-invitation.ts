import { Resend } from "resend";

import { getAppUrl } from "@/lib/app-url";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type InvitationEmailPayload = {
  id: string;
  role: string;
  email: string;
  organization: { id: string; name: string; slug?: string | null };
  inviter: {
    user: { name?: string | null; email?: string | null };
  };
};

/**
 * Sends the organization/team invitation email via Resend.
 * Does not throw: invitation is already persisted; failures are logged only.
 */
export async function sendOrganizationInvitationEmail(
  data: InvitationEmailPayload,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();

  if (!apiKey || !from) {
    const missing: string[] = [];
    if (!apiKey) missing.push("RESEND_API_KEY");
    if (!from) missing.push("RESEND_FROM");
    console.warn(
      `[email] Skipping invitation email (missing env: ${missing.join(", ")}). Restart the dev server after editing .env.local.`,
    );
    return;
  }

  const base = getAppUrl();
  const acceptUrl = `${base}/accept-invitation?invitationId=${encodeURIComponent(data.id)}`;

  const orgName = escapeHtml(data.organization.name);
  const roleLabel = escapeHtml(data.role);
  const inviterLabel = escapeHtml(
    data.inviter.user?.name?.trim() ||
      data.inviter.user?.email?.trim() ||
      "A teammate",
  );

  const subject = `Invitation to join ${data.organization.name}`;
  const html = `
<!DOCTYPE html>
<html>
  <body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #18181b;">
    <p>${inviterLabel} invited you to join <strong>${orgName}</strong> on Cozy Registry.</p>
    <p>Role: <strong>${roleLabel}</strong></p>
    <p><a href="${acceptUrl}" style="color: #2563eb;">Accept invitation</a></p>
    <p style="font-size: 12px; color: #71717a;">If the button does not work, paste this URL into your browser:<br/>${acceptUrl}</p>
  </body>
</html>`.trim();

  const text = `${inviterLabel} invited you to join ${data.organization.name} (${data.role}). Accept: ${acceptUrl}`;

  const to = data.email.toLowerCase();

  try {
    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from,
      to: [to],
      subject,
      html,
      text,
    });

    if (result.error) {
      console.error(
        "[email] Resend rejected invitation email:",
        JSON.stringify(result.error, null, 2),
        { to, hint: "Check RESEND_FROM matches a verified sender in Resend (e.g. onboarding@resend.dev for tests)." },
      );
      return;
    }

    if (result.data?.id) {
      console.info("[email] Invitation email sent via Resend.", {
        to,
        resendEmailId: result.data.id,
      });
    } else {
      console.warn("[email] Resend returned no error but no message id; check Resend dashboard → Emails.", {
        to,
      });
    }
  } catch (err) {
    console.error(
      "[email] Resend send threw:",
      err instanceof Error ? err.message : err,
    );
  }
}
