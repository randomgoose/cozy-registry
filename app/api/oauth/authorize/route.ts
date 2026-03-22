import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  validateClient,
  createAuthorizationCode,
  getCanonicalBaseUrlFromRequest,
  validateOAuthResourceParam,
} from "@/lib/oauth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const responseType = searchParams.get("response_type");
  const state = searchParams.get("state");
  const scope = searchParams.get("scope");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method");
  const resource = searchParams.get("resource");

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
    console.error("[OAuth] authorize GET invalid client", {
      clientId,
      redirectUri,
      error: validation.error,
    });
    return NextResponse.json(
      { error: validation.error, error_description: "Invalid client or redirect_uri" },
      { status: 400 }
    );
  }

  if (!validateOAuthResourceParam(request, resource).ok) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "resource does not match this server's MCP URL",
      },
      { status: 400 },
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    console.info("[OAuth] authorize GET redirect to sign-in", {
      clientId,
      redirectUri,
      hasState: !!state,
      hasScope: !!scope,
      hasCodeChallenge: !!codeChallenge,
      codeChallengeMethod,
    });
    const baseUrl = getCanonicalBaseUrlFromRequest(request);
    const signInUrl = `${baseUrl}/sign-in?callbackUrl=${encodeURIComponent(request.url)}`;
    return NextResponse.redirect(signInUrl);
  }

  console.info("[OAuth] authorize GET ready", {
    clientId,
    redirectUri,
    userId: session.user.id,
    hasState: !!state,
    hasScope: !!scope,
    hasCodeChallenge: !!codeChallenge,
    codeChallengeMethod,
  });

  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri });
  if (state) params.set("state", state);
  if (scope) params.set("scope", scope);
  if (codeChallenge) params.set("code_challenge", codeChallenge);
  if (codeChallengeMethod) params.set("code_challenge_method", codeChallengeMethod);
  if (resource) params.set("resource", resource);
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
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method");
  const resource = searchParams.get("resource");

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
    console.error("[OAuth] authorize POST invalid client", {
      clientId,
      redirectUri,
      error: validation.error,
    });
    return NextResponse.json(
      { error: validation.error, error_description: "Invalid client or redirect_uri" },
      { status: 400 }
    );
  }

  if (!validateOAuthResourceParam(request, resource).ok) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "resource does not match this server's MCP URL",
      },
      { status: 400 },
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    console.error("[OAuth] authorize POST access denied", {
      clientId,
      redirectUri,
    });
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
    codeChallenge: codeChallenge ?? null,
    codeChallengeMethod: codeChallengeMethod ?? null,
  });

  console.info("[OAuth] authorize POST issued code", {
    clientId,
    redirectUri,
    userId: session.user.id,
    hasState: !!state,
    hasScope: !!scope,
    hasCodeChallenge: !!codeChallenge,
    codeChallengeMethod,
  });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);

  return NextResponse.redirect(redirect.toString(), 302);
}
