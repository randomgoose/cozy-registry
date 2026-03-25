#!/usr/bin/env npx tsx
/**
 * Smoke test for Resend (same env vars as production: RESEND_API_KEY, RESEND_FROM).
 *
 * Usage:
 *   npm run test:email
 *   npm run test:email -- you@example.com
 *
 * Recipient order: CLI arg → TEST_EMAIL_TO env → fails.
 */

import { config as loadEnv } from "dotenv";
import { Resend } from "resend";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env.dev" });
loadEnv({ path: ".env" });

async function main() {
  const [, , argTo] = process.argv;
  const to =
    argTo?.trim() ||
    process.env.TEST_EMAIL_TO?.trim() ||
    "";

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();

  if (!apiKey || !from) {
    console.error(
      "Missing RESEND_API_KEY or RESEND_FROM. Set them in .env.local (and restart if you use this file for Next).",
    );
    process.exit(1);
  }

  if (!to) {
    console.error(
      "Missing recipient. Pass an email: npm run test:email -- you@example.com\nOr set TEST_EMAIL_TO in .env.local",
    );
    process.exit(1);
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: [to],
    subject: "Cozy Registry — Resend test",
    text: "If you see this, Resend delivery is working.",
    html: "<p>If you see this, <strong>Resend</strong> delivery is working.</p>",
  });

  if (result.error) {
    console.error("Resend API error:", JSON.stringify(result.error, null, 2));
    process.exit(1);
  }

  console.log("Sent OK. Resend email id:", result.data?.id ?? "(none)");
  console.log("Check inbox / spam for:", to);
  console.log("Dashboard: https://resend.com/emails");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
