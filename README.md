# Cozy Registry

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
pnpm db:migrate-legacy   # 如有旧数据，先迁移 userId
pnpm db:push
pnpm db:seed
```

## Thumbnail Worker

列表页缩略图不是在请求页面时实时生成的，而是通过独立 worker 异步生成。

### 需要的环境变量

- `DATABASE_URL`：worker 读写 job 表与 registry 元数据
- `APP_URL`：公开站点地址，用于截图 `/preview/:owner/:name`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`，建议使用 `registry-thumbnails`

本地调试时，如果 Playwright 无法自动找到浏览器，可额外设置：

- `THUMBNAIL_BROWSER_EXECUTABLE_PATH`

### 运行方式

单次处理一条任务：

```bash
pnpm cozy-thumbnail-worker --once
```

持续轮询：

```bash
pnpm cozy-thumbnail-worker
```

### 推荐的线上部署方式

推荐将 worker 作为独立进程部署在 Linux 环境中（例如 Railway、Render、DigitalOcean App Platform 等），与 Vercel 上的 Web 应用分开运行：

- Web 应用：继续部署在 Vercel
- Thumbnail worker：单独服务，启动命令为 `pnpm cozy-thumbnail-worker`

worker 当前行为：

- `registry:theme`：生成固定模板 thumbnail
- `registry:block` / `registry:ui`：打开 `/preview/...` 页面截图并上传到 Supabase Storage

### 首次上线检查

1. 执行 `pnpm db:push`
2. 在 Supabase Storage 创建 bucket：`registry-thumbnails`
3. 发布一个资源，确认 `registry_asset_jobs` 中出现 `pending` job
4. 启动 worker，确认 job 转为 `completed`
5. 确认 `registry_items.meta.thumbnail` 已写入，列表页优先显示 thumbnail

## 文档

- [文档总览](docs/README.md)
- [Figma Make Quickstart](docs/user-guide/figma-make-quickstart.md)
- [产品总览](docs/00-overview/product-summary.md)
- [产品愿景](docs/10-product/vision.md)
- [路线图](docs/10-product/roadmap.md)
- [当前待办](docs/40-delivery/todo.md)
- [Vibe Coding 提交规范](docs/30-rules/submission-guidelines.md)
- [Figma Make MCP 连接](docs/20-engineering/figma-make-mcp.md)
- [设置指南](SETUP.md)
