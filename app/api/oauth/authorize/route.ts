import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  validateClient,
  createAuthorizationCode,
  getBaseUrl,
} from "@/lib/oauth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const responseType = searchParams.get("response_type");
  const state = searchParams.get("state");
  const scope = searchParams.get("scope");

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "client_id and redirect_uri required" },
      { status: 400 }
    );
  }
  if (responseType !== "code") {
    return NextResponse.json(
      { error: "unsupported_response_type", error_description: "response_type=code only" },
      { status: 400 }
    );
  }

  const validation = validateClient(clientId, redirectUri);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error, error_description: "Invalid client or redirect_uri" },
      { status: 400 }
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    const baseUrl = getBaseUrl();
    const signInUrl = `${baseUrl}/sign-in?callbackUrl=${encodeURIComponent(request.url)}`;
    return NextResponse.redirect(signInUrl);
  }

  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri });
  if (state) params.set("state", state);
  if (scope) params.set("scope", scope);
  const postUrl = `/api/oauth/authorize?${params.toString()}`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>授权 Cozy Registry</title></head>
<body style="font-family: system-ui; max-width: 420px; margin: 2rem auto; padding: 0 1rem;">
  <h1 style="font-size: 1.25rem;">授权访问 Cozy Registry</h1>
  <p>Figma Make 请求访问你的组件列表与发布权限。</p>
  <form method="post" action="${postUrl}" style="display: flex; gap: 0.75rem;">
    <input type="hidden" name="confirm" value="yes" />
    <button type="submit" style="padding: 0.5rem 1rem; background: #18181b; color: #fff; border: none; border-radius: 6px; cursor: pointer;">允许</button>
    <a href="/" style="padding: 0.5rem 1rem; color: #71717a;">取消</a>
  </form>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const state = searchParams.get("state");
  const scope = searchParams.get("scope");

  let bodyConfirm: string | null = null;
  try {
    const form = await request.formData();
    bodyConfirm = form.get("confirm") as string | null;
  } catch {
    // ignore
  }

  if (!clientId || !redirectUri || bodyConfirm !== "yes") {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing or invalid confirm" },
      { status: 400 }
    );
  }

  const validation = validateClient(clientId, redirectUri);
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error, error_description: "Invalid client or redirect_uri" },
      { status: 400 }
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "access_denied", error_description: "Not signed in" },
      { status: 403 }
    );
  }

  const code = await createAuthorizationCode({
    userId: session.user.id,
    clientId,
    redirectUri,
    scope: scope ?? null,
    state: state ?? null,
  });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);

  return NextResponse.redirect(redirect.toString(), 302);
}
