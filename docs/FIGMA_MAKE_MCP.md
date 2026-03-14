# Figma Make 连接 Registry MCP

Figma Make 支持通过**自定义 MCP 连接器**访问我们的 Registry，从而在 Make 中引用团队组件。

## 前提条件

- Figma 付费计划（Full seat）
- Registry 已部署到**公网可访问的 HTTPS 地址**（Figma Make 不支持 localhost）

## 配置步骤

### 1. 部署 Registry

将项目部署到 Vercel、Railway 等，确保可通过 HTTPS 访问。例如：

```
https://your-registry.vercel.app
```

### 2. 在 Figma Make 中添加自定义连接器

1. 打开 Figma Make 文件
2. 点击聊天框中的 **Add context**
3. 选择 **Connectors** → **Manage**
4. 切换到 **Created by you** 标签
5. 点击 **Create**
6. 填写：
   - **Name**: Registry（或任意名称）
   - **MCP server URL**: `https://your-registry.vercel.app/api/mcp`
   - **Authentication**: 选择 **Custom request headers**
   - 在 Additional headers 中添加：
     - **Header name**: `Authorization`
     - **Header value**: `Bearer <你的Token>`
   - Token 在登录后于 **设置** 页面创建

### 3. 连接并使用

1. 点击 **Connect** 完成连接
2. 在 **Manage** 中启用 `list_components` 和 `get_component` 工具
3. 在聊天中通过 `@Registry` 引用，或直接输入如：
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
| `publish_component` | Write | 发布新组件到 Registry（需在 Connector 设置中启用） |

## 注意事项

- **必须公网 HTTPS**：Figma Make 不支持 localhost 或 stdio MCP
- **鉴权**：`publish_component` 需要 Bearer Token，在设置页创建后填入 Connector 的 Additional headers
- **组织发布**：Organization/Enterprise 计划下，管理员可将自定义连接器发布给整个组织使用
