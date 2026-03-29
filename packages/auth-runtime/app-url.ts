/**
 * Public site URL for links in emails and redirects.
 * Prefer NEXT_PUBLIC_APP_URL / APP_URL so production matches the browser origin.
 */
export function getAppUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:5173";
  return raw.replace(/\/+$/, "");
}
