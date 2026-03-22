import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <h1>figma-oauth-smoke</h1>
      <p>Minimal Next.js app to validate Figma Make MCP + OAuth.</p>
      <ul>
        <li>
          MCP URL (use in Figma): <code>/api/mcp</code> (full URL with your deployment host)
        </li>
        <li>
          Health: <Link href="/api/health">/api/health</Link>
        </li>
        <li>
          Auth metadata:{" "}
          <Link href="/.well-known/oauth-authorization-server">
            /.well-known/oauth-authorization-server
          </Link>
        </li>
        <li>
          PRM:{" "}
          <Link href="/.well-known/oauth-protected-resource">/.well-known/oauth-protected-resource</Link>
        </li>
      </ul>
      <p>
        Set env <code>OAUTH_CODE_SIGNING_SECRET</code> (required in prod). Optional:{" "}
        <code>OAUTH_CLIENT_ID</code>, <code>OAUTH_CLIENT_SECRET</code>.
      </p>
      <p>
        Debug response bodies (Vercel request list does not show them): set{" "}
        <code>MCP_INSPECT_SECRET</code>, then <code>POST /api/mcp-inspect</code> with the same body
        and headers as <code>/api/mcp</code>, plus header <code>X-MCP-Inspect</code>.
      </p>
    </>
  );
}
