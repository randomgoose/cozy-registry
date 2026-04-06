Status: active
Owner: engineering
Last updated: 2025-02-14
Source of truth: yes

# System Overview

更完整的架构分层与 Mermaid 图见 [系统架构与数据流](./system-architecture.md)。  
设计北极星（Explicit / Deterministic / Source-first / 抽取与发布分层）见 [Registry 设计原则](./registry-design-principles.md)。

## 模块

- Web App: 浏览、发布、预览、设置、dashboard、collections
- Registry API: 输出组件列表和单组件 bundle，兼容 shadcn registry 消费方式
- MCP Server: 提供 AI 读写工具，支持 HTTP 和 stdio
- Preview Runtime: 服务端构建浏览器可运行的预览 bundle
- Auth + Policy: 会话、API key、OAuth 和 scope policy
- Database: PostgreSQL + Drizzle，持久化 item、files、versions、collections 等

## 核心数据流

1. 发布
   用户提交 `content` 或 `files`
   资产来源可以是 Web 页面、MCP、Figma Make 等 Vibe coding 工具
   服务端做基础校验、提取依赖、写入 `registry_items` / `registry_files` / version 快照

2. 浏览与消费
   Web 页面和 `/api/registry` 从数据库读取 item
   `/api/r/...` 输出 shadcn 风格条目 JSON

3. 预览
   服务端将源码 bundle 写入临时目录
   用 `esbuild` 构建预览产物
   浏览器在 iframe 中加载运行时 HTML 和产物

4. AI 使用
   AI 客户端通过 `/api/mcp` 或本地 `mcp-server.ts` 调用 `list_components` / `get_component` / `publish_component`

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
- [Dashboard Navigation Performance Plan](../20-engineering/dashboard-navigation-performance-plan.md)：后台页面切换慢的阶段性优化方案。
- [Registry Resource Lifecycle Spec](../20-engineering/registry-resource-lifecycle-spec.md)：资源归档、硬删除与个人/组织归属迁移方案。
- [Preview Third-Party Dependency Governance Spec](../20-engineering/preview-third-party-dependency-governance-spec.md)：第三方依赖的分级准入、发布校验与预构建治理方案。
- [Preview Dependency Provider Refactor Spec](../20-engineering/preview-dependency-provider-refactor-spec.md)：从宿主 `node_modules` / `next.config` tracing 过渡到 provider-owned dependency assets 的实现方案。
- [Soft-Allowed Compatible Artifact Spec](../20-engineering/soft-allowed-compatible-artifact-spec.md)：让 `recharts` 等浏览器友好长尾依赖从 `runtime-only` 提升到 `compatible-artifact` 的补充方案。
- [Multi-Story Preview Page Spec](../20-engineering/multi-story-preview-page-spec.md)：在一个页面里切换不同 per-story artifact 的最小多 story 预览方案。
- [Story Preview UX / Performance Spec](../20-engineering/story-preview-ux-performance-spec.md)：story 预览的产品目标、性能指标与 artifact-first 主路径定义。
- [Preview Artifact Capability Model Spec](../20-engineering/preview-artifact-capability-model-spec.md)：`managed-artifact / compatible-artifact / runtime-only` 的能力分层与实现方向。
- [Preview Artifact Retrospective](../20-engineering/preview-artifact-retrospective.md)：从重运行时装配迁移到重构建阶段 artifact 的设计复盘、经验与后续原则。
- [Project-Scoped Registry Identity Spec](../20-engineering/project-scoped-registry-identity-spec.md)：将 registry 正式身份从 `owner + name` 升级到 `owner + project + name` 的系统方案。
- [Project Resource Relationship Spec](../20-engineering/project-resource-relationship-spec.md)：将 project 升级为默认设计上下文边界，先从 `defaultThemeResourceRef` 与 resource-level theme override 做起。
- [Live Style Preview And Committed Artifact Spec](../20-engineering/live-style-preview-and-committed-artifact-spec.md)：将 runtime 样式覆盖与 committed artifact 重建拆成两条协同链路，服务轻量调样式体验。
