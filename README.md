# Vibe Registry

设计师参与的组件分发中心，支持 Vibe Coding 与 AI 使用。

## 功能

- **组件浏览**：查看、预览、复制已发布组件
- **组件发布**：粘贴 TSX、填写元数据、通过语法检查后发布
- **AI 集成**：MCP 工具供 Cursor、Figma Make 等调用
- **shadcn 兼容**：输出标准 registry 格式，支持 shadcn CLI 等工具

## 快速开始

### 1. 环境变量

```bash
cp .env.example .env
# 编辑 .env，填写 DATABASE_URL
```

### 2. 数据库

```bash
pnpm db:push
pnpm db:seed   # 添加预设组件
```

### 3. 启动

```bash
pnpm dev
```

访问 http://localhost:3000

## 部署到 Vercel

1. 将项目推送到 GitHub，或在本地运行 `vercel` 部署
2. 在 Vercel 项目设置中配置环境变量：
   - `DATABASE_URL`：使用 [Vercel Postgres](https://vercel.com/storage/postgres) 或 [Neon](https://neon.tech)、[Supabase](https://supabase.com) 等
   - `NEXT_PUBLIC_APP_URL`：部署后的 URL（如 `https://xxx.vercel.app`），用于 MCP 和 registry 链接
3. 部署后，本地连接生产数据库执行 schema 和 seed：

### 首次部署后

连接远程数据库执行 schema 和 seed：

```bash
# 确保 .env 中的 DATABASE_URL 指向生产数据库
pnpm db:push
pnpm db:seed
```

## 文档

- [产品文档](docs/PRODUCT.md)
- [设置指南](SETUP.md)
- [Figma Make MCP 连接](docs/FIGMA_MAKE_MCP.md)
