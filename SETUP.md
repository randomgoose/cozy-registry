# Cozy Registry 项目设置

## 1. 环境变量

复制 `.env.example` 为 `.env` 并填写数据库连接：

```bash
cp .env.example .env
```

编辑 `.env`：

```
DATABASE_URL="postgresql://user:password@localhost:5432/registry"
```

## 2. 数据库

确保 PostgreSQL 已安装并运行。创建数据库：

```sql
CREATE DATABASE registry;
```

推送 schema 到数据库：

```bash
pnpm db:push
```

## 3. 预设组件

执行 seed 添加 Hero Section、FAQ、Pricing Card：

```bash
pnpm db:seed
```

## 4. 启动应用

```bash
pnpm dev
```

访问：

- Web: http://localhost:5173
- Platform: http://localhost:3000

## 5. Cozy Registry API

- **Registry 列表**: http://localhost:3000/registry
- **单个组件**: http://localhost:3000/r/{owner}/{name}（如 `/r/legacy/hero-section`）

## 6. MCP 配置（Cursor）

项目已包含 `.cursor/mcp.json`，Cursor 会自动加载 Cozy registry MCP。

**使用前**：确保 `cozy-platform` 已运行（`pnpm dev` 或 `pnpm cozy-platform`）。

如果你想单独启本地 stdio MCP server，也可以运行：

```bash
COZY_PLATFORM_BASE_URL=http://localhost:3000 pnpm cozy-mcp
```

**验证**：在 Cursor 中对 AI 说「列出 registry 中的组件」或「获取 hero-section 组件的代码」。
