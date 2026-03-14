# Figma Make 连接 Cozy Registry MCP

Figma Make 支持通过**自定义 MCP 连接器**访问 Cozy Registry，从而在 Make 中引用团队组件。

## 前提条件

- Figma 付费计划（Full seat）
- Cozy Registry 已部署到**公网可访问的 HTTPS 地址**（Figma Make 不支持 localhost）

## 配置步骤

### 1. 部署 Cozy Registry

将项目部署到 Vercel、Railway 等，确保可通过 HTTPS 访问。例如：

```
https://cozy-registry.vercel.app
```

### 2. 在 Figma Make 中添加自定义连接器

两种认证方式二选一即可。**MCP server URL** 为必填，填你部署的 Cozy Registry 地址 + `/api/mcp`。

#### 方式 A：OAuth（推荐，可在 Figma 内直接登录）

1. 打开 Figma Make 文件 → **Add context** → **Connectors** → **Manage** → **Created by you** → **Create**
2. 填写：
   - **Name**：Cozy Registry（任意）
   - **MCP server URL** *：`https://<你的 Cozy Registry 域名>/api/mcp`（例如 `https://cozy-registry-xxx.vercel.app/api/mcp`）
   - **Authentication**：选择 **OAuth 2.0**
3. 展开 **Advanced settings** → **OAuth credentials**：
   - **Client ID**：填 `cozy-figma-make`（与 Cozy Registry 默认一致；若你在服务端设置了 `OAUTH_FIGMA_CLIENT_ID`，则填该值）
   - **Client secret**：若你在 Cozy Registry 环境变量中设置了 `OAUTH_FIGMA_CLIENT_SECRET`，则在此填**同一值**；未设置则可留空
4. 点击 **Connect**：浏览器会跳转到 Cozy Registry，登录或注册后点击「允许」，即可完成授权，无需复制 Token。

#### 方式 B：Custom request headers（手动填 Token）

1. 同上创建连接器，**Authentication** 选择 **Custom request headers**
2. 在 **Additional headers** 中点击「Add header」或使用示例行：
   - **Name**：`Authorization`
   - **Value**：`Bearer <你的Token>`
   - Token 在登录 Cozy Registry 后于 **设置** 页面创建

### 3. 连接并使用

1. 点击 **Connect** 完成连接
2. 在 **Manage** 中启用 `list_components` 和 `get_component` 工具
3. 在聊天中通过 `@Cozy Registry` 引用，或直接输入如：
   - 「列出 registry 中的组件」
   - 「用 hero-section 组件做首屏」

## MCP 端点

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/mcp` | GET, POST, DELETE | MCP Streamable HTTP 协议端点 |

## 可用工具

| 工具 | 类型 | 说明 |
|------|------|------|
| `list_components` | Read | 列出所有可用组件 |
| `get_component` | Read | 获取指定组件的完整源码和元数据 |
| `publish_component` | Write | 发布新组件到 Cozy Registry（需在 Connector 设置中启用） |

## 注意事项

- **必须公网 HTTPS**：Figma Make 不支持 localhost 或 stdio MCP
- **MCP server URL 必填**：创建连接器时需先填写 MCP server URL，否则会提示 "Server URL is required"
- **OAuth 时 Advanced settings**：选择 OAuth 2.0 后，需在 Advanced settings → OAuth credentials 中填写 Client ID（及可选 Client secret），与 Cozy Registry 服务端配置一致
- **鉴权**：`publish_component` 需要 Bearer Token；用 OAuth 时由授权流程自动获得，用 Custom headers 时在设置页创建后填入 Additional headers
- **组织发布**：Organization/Enterprise 计划下，管理员可将自定义连接器发布给整个组织使用

---

## 能否在 Figma Make 里直接登录/注册？（替代手动填 Token）

**可以。** Figma Make 的自定义 MCP 连接器支持多种认证方式，除当前的「Custom request headers」（用户手动填 Bearer Token）外，还支持：

- **OAuth 2.0**：由 MCP 服务端声明 OAuth 能力后，Figma 会在用户点击「Connect」时跳转到**你的站点**完成登录/授权，再带着 token 回到 Figma，无需用户复制粘贴 Token。
- **OAuth with client credentials**：用你自己在 Figma 里填的 Client ID/Secret 走 OAuth。

若在 Cozy Registry 侧实现 **OAuth 2.0 提供方**（授权页 + Token 端点），并在 MCP 能力里声明支持 OAuth，用户就可以在 Figma Make 里：

1. 添加连接器时选择 **OAuth**（而不是 Custom headers）
2. 点击 Connect → 被重定向到 Cozy Registry 的登录/注册页
3. 登录或注册后同意授权 → 自动回到 Figma，Figma 用拿到的 token 请求 MCP

这样就不再需要「先去 Cozy Registry 设置页创建 Token，再复制到 Figma Make 的 Header」这一步。

### 实现要点（供后续开发）

| 项 | 说明 |
|----|------|
| **Figma 回调 URL** | 在 OAuth 应用里配置的重定向地址需包含：`https://www.figma.com/oauth/mcp/callback` |
| **服务端** | 提供 OAuth 2.0 的 **authorization endpoint**（登录/注册 + 授权页）和 **token endpoint**（用 code 换 access_token），并签发用于 MCP 请求的 Bearer token |
| **MCP 声明** | MCP 端点需在协议层声明支持 OAuth（按 MCP/Streamable HTTP 规范），这样 Figma Make 在创建连接器时才会显示 OAuth 选项 |
| **现有登录** | 可复用 Cozy Registry 现有登录（如 Better Auth），在授权页让用户 sign in / sign up，授权后发 code 给 Figma 回调并换 token |

**已实现**：Cozy Registry 已支持 OAuth 2.0。在 Figma Make 创建连接器时选择 **Authentication: OAuth 2.0**，点击 Connect 后会跳转到本站登录/注册并授权，无需再手动复制 Token。详见上文「方式 A：OAuth」。
