Status: draft
Owner: shared
Last updated: 2026-03-22
Source of truth: yes

# OAuth Client Strategy

这份文档定义 `Cozy Registry` 作为 OAuth Authorization Server 时，应该如何管理外部 MCP 客户端的 `client_id` / `client_secret`。

当前重点支持的客户端：

- `Figma Make`
- `Cursor`

目标不是为每个用户发一套 client，而是为**每一种外部工具**维护一套独立的 OAuth client 配置，同时让用户授权结果体现在 access token / refresh token / policy 上。

## 结论

当前推荐的模型是：

- **每种工具一个固定 client**
- **每个部署环境一套独立凭证**
- **用户身份和权限不通过 client 区分，而通过 token 和 policy 区分**

这意味着：

- `Figma Make` 应该有自己的一套 `client_id` / `client_secret`
- `Cursor` 应该有自己的一套 `client_id` / `client_secret`
- `dev` 与 `prod` 不应该共用同一套 secret

当前不建议：

- 所有工具共用一个 `client_id`
- 每个用户一套 `client_id`
- 每次接入时动态给用户生成独立 client

## 为什么不是“所有工具共用一个 client”

理论上可以让所有工具共用一套 client，但长期会带来这些问题：

- 日志和排障无法区分到底是哪一个外部工具在发起授权
- 不同客户端的 OAuth 兼容细节会相互污染
- 某个 secret 泄露会影响全部外部工具
- redirect URI、auth method、metadata 兼容项无法按工具独立演进

对于 `Cozy Registry` 这种希望接入多个 MCP vibe coding 工具的产品来说，更合理的抽象是：

- `client` 代表“哪个外部应用”
- `token` 代表“哪个用户授权了这个应用”

## 为什么不是“每个用户一套 client”

当前阶段没有必要。

这类模型更适合：

- 每个 tenant / team 自己注册外部应用
- 需要强租户隔离的企业平台
- 需要审计每个集成实例的 client 生命周期

`Cozy Registry` 现在更像是：

- 一个统一的 OAuth server
- 面向已知的外部客户端（如 `Figma Make`、`Cursor`）
- 用户差异通过 access token / refresh token / policy 表达

所以现阶段为每个用户创建 client，只会增加复杂度，而不会明显提升能力。

## 推荐模型

### 一层：Tool Client

每一种外部工具一个固定 client，例如：

- `cozy-figma-make`
- `cozy-cursor`

它们各自拥有：

- `client_id`
- `client_secret`
- `redirect_uris`
- 可选的工具标识 `tool`

### 一层：User Authorization

用户点击授权后，服务端发出：

- `access_token`
- `refresh_token`

这里表达的是：

- 哪个用户授权了这个工具
- 这个授权作用于哪个 OAuth client

### 一层：Policy / Scope

授权后的访问边界由 policy 控制，例如：

- 允许哪些 collections
- 允许哪些类型
- 允许哪些 owner / namespace

这层能力和 OAuth client 是正交的：

- client 负责“哪个工具”
- policy 负责“这个工具在该用户上下文里能看什么”

## 当前建议支持的客户端

### 1. Figma Make

用途：

- MCP 接入
- OAuth 授权
- 在 Figma Make 中直接访问 Cozy Registry 的 MCP 能力

建议命名：

- `cozy-figma-make`（prod）
- `cozy-figma-make-dev`（dev）

redirect URI 应以 Figma 官方要求为准。

### 2. Cursor

用途：

- MCP 接入
- 让 Cursor 直接发现、读取、安装和升级 Registry 资产

建议命名：

- `cozy-cursor`（prod）
- `cozy-cursor-dev`（dev）

Cursor 官方文档已经明确支持 MCP OAuth：

- `SSE` remote server：`OAuth`
- `Streamable HTTP` remote server：`OAuth`

同时，Cursor 也保留了手动 `headers` 配置能力，例如在 `mcp.json` 中传：

```json
{
  "mcpServers": {
    "cozy-registry": {
      "url": "https://example.com/api/mcp",
      "headers": {
        "Authorization": "Bearer ${env:COZY_REGISTRY_TOKEN}"
      }
    }
  }
}
```

因此，当前对 Cursor 的工程策略应该是：

- **保留 OAuth 作为正式架构方向**
- **同时保留 manual auth headers 作为兼容与调试路径**
- **Cursor 与 Figma 使用不同 client，不共用 secret**
- **Cursor 同时兼容两种 OAuth 形态：**
  - `Static OAuth`：固定 `CLIENT_ID / CLIENT_SECRET`
  - `Public client / DCR`：`token_endpoint_auth_method = none`

参考：

- [Cursor MCP docs](https://docs.cursor.com/en/context/mcp)

当前建议默认值：

- `client_id`: `cozy-cursor`
- `redirect_uri`: `cursor://anysphere.cursor-mcp/oauth/callback`
- `token_endpoint_auth_method`：
  - 若使用 Static OAuth，建议 `client_secret_post`
  - 若使用 public client / dynamic registration，建议 `none`

## 每个环境都要独立

推荐至少拆成：

- `dev`
- `prod`

原因：

- 测试时不会污染生产授权
- 可以单独轮换 secret
- 日志更容易判断来源
- redirect URI 也通常不同

推荐的命名方式：

- `cozy-figma-make-dev`
- `cozy-figma-make`
- `cozy-cursor-dev`
- `cozy-cursor`

## 对当前实现的建议演进

当前代码仍偏向“单一 Figma client”模型，核心入口在：

- [`lib/oauth.ts`](./../../lib/oauth.ts)
- [`app/api/oauth/register/route.ts`](./../../app/api/oauth/register/route.ts)
- [`app/api/oauth/token/route.ts`](./../../app/api/oauth/token/route.ts)
- [`lib/oauth-metadata.ts`](./../../lib/oauth-metadata.ts)

长期建议从：

- `getOAuthClient()`

演进为：

- `getOAuthClientByClientId(clientId)`
- `listOAuthClients()`

例如：

```ts
type OAuthClientConfig = {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  tool: "figma-make" | "cursor";
};

const OAUTH_CLIENTS: OAuthClientConfig[] = [
  {
    clientId: "cozy-figma-make",
    clientSecret: process.env.OAUTH_FIGMA_CLIENT_SECRET ?? "",
    redirectUris: ["https://www.figma.com/oauth/mcp/callback"],
    tool: "figma-make",
  },
  {
    clientId: "cozy-cursor",
    clientSecret: process.env.OAUTH_CURSOR_CLIENT_SECRET ?? "",
    redirectUris: ["<cursor-callback>"],
    tool: "cursor",
  },
];
```

然后在 token / authorize / register 里统一按 `client_id` 查配置。

## 建议的环境变量形态

现阶段推荐按工具显式配置：

- `OAUTH_FIGMA_CLIENT_ID`
- `OAUTH_FIGMA_CLIENT_SECRET`
- `OAUTH_CURSOR_CLIENT_ID`
- `OAUTH_CURSOR_CLIENT_SECRET`

如果未来客户端数量增加，再考虑演进成更结构化配置。

## 什么时候需要再升级模型

以下情况下，可以考虑从“每个工具一个 client”升级到更细粒度：

- 需要支持很多外部客户端
- 需要按 tenant / team 隔离 client 生命周期
- 需要不同组织拥有自己的 redirect URI / secret
- 需要审计每个外部集成实例

在那之前，当前模型已经足够覆盖：

- `Figma Make`
- `Cursor`
- 少量新增 MCP 工具

## 当前工程原则

一句话原则：

**一个 OAuth server，多个 tool clients；用户权限不在 client 上分叉，而在 token 和 policy 上分叉。**

补充原则：

- `Figma Make` 与 `Cursor` 都应拥有独立的 OAuth client
- `Cursor` 既支持 OAuth，也应保留 `Authorization` headers 直连方案
- `Cursor` 的 OAuth 不应被假设为单一形态，而应兼容 secret client 与 public client
- OAuth 是长期正式路径，headers 方案是低摩擦 fallback 与运维调试路径
