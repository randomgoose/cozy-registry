# Figma OAuth 排查记录（2026-03-22）

这份文档记录本轮 `Figma` MCP OAuth 排查时，当前仓库里最值得怀疑的问题点，以及与一个已验证可用的最小 Flask/Vercel 实现相比，主应用缺少了哪些兼容项。

目标不是在这里直接修复，而是给后续会话一个可复用的排查起点。

## 结论摘要

当前最可疑的根因，不是 MCP transport 本身，而是 **OAuth 会话形态对 Figma 来说不够完整**。

现象是：

- 用户在授权页点击允许后能正常跳回 `figma.com`
- 但 Figma 后台持续执行内部 `check_auth`
- `needsAuthorization` 一直为 `true`
- 最终因为轮询过多触发 rate limit

和一个已验证通过的最小 Flask 实现对比后，本仓库最值得优先怀疑的点是：

1. `/token` 只返回 `access_token`，没有 `refresh_token`
2. `/token` 只支持 `grant_type=authorization_code`，不支持 `grant_type=refresh_token`
3. authorization server metadata 只声明 `authorization_code`，没有声明 `refresh_token`
4. authorization redirect 回调没有带 `iss`
5. 缺少 dynamic client registration 的更完整响应形态

如果要按优先级排序，我当前建议是：

1. 先补 `refresh_token`
2. 再补 `refresh_token` grant
3. 再同步 metadata
4. 再补 `iss`
5. 再补 registration 响应细节

## 当前仓库里最可疑的代码

### 1. `/token` 只支持 authorization_code

文件：
[app/api/oauth/token/route.ts](/Users/chenchen/Documents/GitHub/my-app/app/api/oauth/token/route.ts)

当前实现里明确拒绝除 `authorization_code` 之外的所有 grant：

```ts
if (grantType !== "authorization_code") {
  console.error("[OAuth] token unsupported grant", { grantType });
  return NextResponse.json(
    { error: "unsupported_grant_type", error_description: "grant_type=authorization_code only" },
    { status: 400 }
  );
}
```

这意味着 Figma 如果把“授权完成”建立在可刷新的会话上，就可能一直不认这次授权。

### 2. `/token` 不返回 refresh_token

同一个文件的响应体目前只有 `access_token`：

```ts
return NextResponse.json(
  {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 31536000,
    scope: "mcp:tools",
  },
  {
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  },
);
```

这和最终跑通的 Flask 版本差异最大。那边是在这里补了 `refresh_token` 后才真正稳定跑通。

### 3. metadata 只声明 authorization_code

文件：
[lib/oauth-metadata.ts](/Users/chenchen/Documents/GitHub/my-app/lib/oauth-metadata.ts)

当前 metadata：

```ts
return {
  issuer: baseUrl,
  authorization_endpoint: `${baseUrl}/api/oauth/authorize`,
  token_endpoint: `${baseUrl}/api/oauth/token`,
  scopes_supported: ["mcp:tools"],
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  code_challenge_methods_supported: ["S256", "plain"],
  token_endpoint_auth_methods_supported: client.clientSecret
    ? ["client_secret_post", "client_secret_basic"]
    : ["none", "client_secret_post", "client_secret_basic"],
};
```

如果 `/token` 最终要补 `refresh_token`，这里也需要同步声明，否则客户端对服务能力的判断和真实实现不一致。

### 4. authorize 回调没有带 iss

文件：
[app/api/oauth/authorize/route.ts](/Users/chenchen/Documents/GitHub/my-app/app/api/oauth/authorize/route.ts)

当前回调逻辑：

```ts
const redirect = new URL(redirectUri);
redirect.searchParams.set("code", code);
if (state) redirect.searchParams.set("state", state);

return NextResponse.redirect(redirect.toString(), 302);
```

这里没有给回调附加：

```text
iss=<authorization-server-origin>
```

而在最终跑通的 Flask 版本里，我补了两处：

- metadata 增加 `authorization_response_iss_parameter_supported: true`
- authorize redirect 增加 `iss`

我目前判断这不是头号根因，但很可能是一个需要一起补齐的兼容点。

## 成功版本里实际补过的关键能力

下面是另一个已验证通过的最小 Flask 实现中，最终奏效的几个关键点。

### 1. metadata 同时声明 authorization_code 和 refresh_token

```python
return {
    "issuer": root,
    "authorization_endpoint": f"{root}/authorize",
    "token_endpoint": f"{root}/token",
    "registration_endpoint": f"{root}/register",
    "response_types_supported": ["code"],
    "grant_types_supported": ["authorization_code", "refresh_token"],
    "token_endpoint_auth_methods_supported": ["none", "client_secret_post"],
    "code_challenge_methods_supported": ["S256", "plain"],
    "scopes_supported": ["openid", "profile", "mcp:read", "mcp:write"],
    "authorization_response_iss_parameter_supported": True,
}
```

### 2. authorize redirect 带上 iss

```python
query = {"code": code, "iss": issuer().rstrip("/")}
if state:
    query["state"] = state
return redirect(f"{redirect_uri}?{urlencode(query)}", code=302)
```

### 3. `/token` 在 authorization_code exchange 时返回 refresh_token

```python
return jsonify(
    {
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": token_ttl_seconds(),
        "scope": code_payload.get("scope", ""),
        "refresh_token": refresh_token,
    }
)
```

### 4. `/token` 支持 grant_type=refresh_token

```python
if grant_type == "refresh_token":
    refresh_token = request.form.get("refresh_token", "")
    ...
    return jsonify(
        {
            "access_token": access_token,
            "token_type": "Bearer",
            "expires_in": token_ttl_seconds(),
            "scope": refresh_payload.get("scope", ""),
            "refresh_token": new_refresh_token,
        }
    )
```

### 5. `/register` 返回更完整的 client metadata

```python
return jsonify(
    {
        "client_id": synthetic_client_id,
        "client_id_issued_at": int(time.time()),
        "client_secret": body.get("client_secret", "figma-make-test-secret"),
        "client_secret_expires_at": 0,
        "grant_types": body.get("grant_types", ["authorization_code", "refresh_token"]),
        "response_types": body.get("response_types", ["code"]),
        "redirect_uris": body.get("redirect_uris", [figma_callback_url()]),
        "token_endpoint_auth_method": body.get("token_endpoint_auth_method", "client_secret_post"),
        "scope": body.get("scope", "openid profile mcp:read mcp:write"),
    }
), 201
```

## 当前判断

如果只做一个最小改动，我会先改主应用的 `/token`：

- 返回 `refresh_token`
- 支持 `grant_type=refresh_token`

然后再改 metadata：

- `grant_types_supported` 增加 `refresh_token`

最后再补：

- `authorization_response_iss_parameter_supported`
- authorize redirect 里的 `iss`
- 更完整的 `/register`

## 建议后续修改入口

后续如果要在这个仓库里正式修复，优先看这几个文件：

- [app/api/oauth/token/route.ts](/Users/chenchen/Documents/GitHub/my-app/app/api/oauth/token/route.ts)
- [lib/oauth-metadata.ts](/Users/chenchen/Documents/GitHub/my-app/lib/oauth-metadata.ts)
- [app/api/oauth/authorize/route.ts](/Users/chenchen/Documents/GitHub/my-app/app/api/oauth/authorize/route.ts)
- [lib/oauth.ts](/Users/chenchen/Documents/GitHub/my-app/lib/oauth.ts)

## 备注

这份文档反映的是 2026-03-22 这一轮排查的结论，不代表最终唯一根因；但基于已跑通的对照实现，这几个点值得最高优先级处理。

### Smoke 仓库对齐（便于对照主应用）

`figma-oauth-smoke`（Next / Vercel）与 `figma-oauth-smoke-railway`（Hono / Railway）已按上文要点实现：

- `grant_type=refresh_token`、签名的 `refresh_token` 轮换、`authorization_code` 响应含 `refresh_token`
- AS metadata：`grant_types_supported` 含 `refresh_token`、`authorization_response_iss_parameter_supported: true`、`registration_endpoint`
- 授权回调 query 增加 `iss`（与 `issuer` 一致）
- `POST /api/oauth/register`（Railway 上 `/api/x/oauth/register` 同响应）返回较完整的 client metadata

主应用 **Cozy Registry** 是否采纳同一套改动需单独评审（涉及 DB、Better Auth API key 等）。
