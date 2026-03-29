Status: active
Owner: engineering
Last updated: 2026-03-28
Source of truth: yes

# System Overview

更完整的架构分层与 Mermaid 图见 [系统架构与数据流](./system-architecture.md)。  
设计北极星（Explicit / Deterministic / Source-first / 抽取与发布分层）见 [Registry 设计原则](./registry-design-principles.md)。

## 模块

- Web App (`apps/web`): 浏览、发布、预览、设置、dashboard、projects
- Platform (`cozy-platform`): Registry API、auth-control、OAuth、MCP、preview、well-known 元数据
- MCP Server: 提供 AI 读写工具，支持 HTTP 和 stdio
- Preview Runtime: 服务端构建浏览器可运行的预览 bundle
- Auth + Policy: Better Auth 底层能力 + 平台侧 auth-control / OAuth / scope policy
- Database: PostgreSQL + Drizzle，持久化 item、files、versions、projects（当前兼容层仍映射 `registry_collections`）等

## 核心数据流

1. 发布
   用户提交 `content` 或 `files`
   资产来源可以是 Web 页面、MCP、Figma Make 等 Vibe coding 工具
   服务端做基础校验、提取依赖、写入 `registry_items` / `registry_files` / version 快照

2. 浏览与消费
   Web 页面通过 `cozy-platform` 读取 item
   `/r/...` 输出 shadcn 风格条目 JSON

3. 预览
   服务端将源码 bundle 写入临时目录
   用 `esbuild` 构建预览产物
   浏览器在 iframe 中加载运行时 HTML 和产物

4. AI 使用
   AI 客户端通过 `/mcp` 或本地 `bin/cozy-mcp-stdio.ts` 调用 `list_components` / `get_component` / `publish_component`

## 当前实现特点

- owner 既支持 handle，也兼容 legacy `userId`
- 资产是源码分发，不是编译产物分发
- 同时支持 `registry:block`、`registry:ui`、`registry:theme`
- theme 支持作为独立 registry item，并可通过 `registryDependencies` 递归注入
- API key 支持集合、类型和 owner 范围限制

## 工程与优化 backlog

- [项目优化与健康状况（非测试）](../20-engineering/project-optimization.md)：CI、安全、可观测性、性能与后续优先级。
- [Registry 依赖测试方案](../20-engineering/registry-dependency-test-plan.md)：自动化测试与集成建议。
- [API / Service Extraction Spec](../20-engineering/api-service-extraction-spec.md)：将平台能力从 Web 宿主中抽离的阶段性架构方案。
