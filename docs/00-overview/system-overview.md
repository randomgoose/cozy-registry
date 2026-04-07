Status: active
Owner: engineering
Last updated: 2026-04-07
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

3. 预览构建
   服务端将源码 bundle 写入临时目录
   用 `esbuild` 构建预览产物
   worker 会生成并上传静态 preview artifact，例如：
   - `preview.js`
   - `preview.css`
   - `manifest.json`
   - `preview.html`
   - 可选的 `stories.html`

4. 预览分发与运行
   Web 页面优先命中 ready artifact
   `/preview/...` route 逐步收敛为 artifact-first 的薄控制层
   浏览器在 iframe 中加载静态 preview HTML 与产物，而不是每次请求时重新拼装页面

5. AI 使用
   AI 客户端通过 `/api/mcp` 或本地 `mcp-server.ts` 调用 `list_components` / `get_component` / `publish_component`

## 当前实现特点

- owner 既支持 handle，也兼容 legacy `userId`
- 资产发布仍以源码与版本快照为中心，但 preview 已进入“构建后分发 artifact”的主路径
- 同时支持 `registry:block`、`registry:ui`、`registry:theme`
- theme 支持作为独立 registry item，并可通过 `registryDependencies` 与 project-level relationship 参与 preview / docs 渲染
- registry 正式身份已升级为 `owner + project + name`，同时兼容 legacy `owner + name`
- preview 第三方依赖已形成多层模型：
  - governance layer：决定依赖是否允许、属于哪种政策边界
  - execution layer：在允许前提下选择 `managed-artifact` / `compatible-artifact` / `runtime-only`
  - delivery layer：逐步从 `compatible-remote` 演进到平台控制的 `compatible-bundled`
- preview artifact 已通过对象存储 public URL + 长缓存头静态分发，并继续朝 CDN 优先分发收敛
- API key 支持集合、类型和 owner 范围限制

## 近期两条主线的收口状态

### 预览构建动态决策

当前已经收住的部分：

- 依赖治理、执行、交付三层已经分开：
  - governance：`tier` / `previewCapability` / `providerMode`
  - execution：`managed-artifact` / `compatible-artifact` / `runtime-only`
  - delivery：`compatible-remote` / `compatible-bundled`
- `soft-allowed + explicit version` 已可以进入 `compatible-artifact`
- worker 已具备 best-effort `compatible-bundled` materialization 路径
- manifest、`preview.html`、preview route 已能消费 compatible delivery metadata

当前尚未完全收口的部分：

- `compatible-bundled` 仍处于逐步验证阶段，还不是所有高频 compatible 依赖的默认稳定路径
- preview 首屏性能仍保留少量 dynamic assembly / external request 成本
- `stories.html` 虽已进入 artifact-first 主路径，但完整 docs-style 静态交付仍在继续演进

### 项目样式管理

当前已经收住的部分：

- project 支持 `defaultThemeResourceRef`
- resource 支持 `meta.themeResourceRef` override
- preview、artifact build、multi-story preview、status API 已共享同一套 theme resolution helper
- UI 已能展示 `resolvedThemeResourceRef` 与 `resolvedThemeSource`
- runtime `live style preview` 已可作为 session-local patch 覆盖已提交 artifact
- artifact worker 现在也会把 resolved theme CSS 带入 `preview.html`

当前尚未完全收口的部分：

- install protocol 还未正式消费 project-level resolved theme relationship
- theme 资源的长期 canonical format 仍待从 CSS-first 逐步演进到更结构化的 token 模型
- theme 变化与关联 artifact freshness 的强一致策略还未完全定案

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
- [Component Style Organization Model Spec](../20-engineering/component-style-organization-model-spec.md)：定义组件局部样式与 design-context style 的正式分层，并评估 Tailwind、同目录 CSS、mixed mode、CSS Modules 等在本项目中的实际支持度。
- [Live Style Preview And Committed Artifact Spec](../20-engineering/live-style-preview-and-committed-artifact-spec.md)：将 runtime 样式覆盖与 committed artifact 重建拆成两条协同链路，服务轻量调样式体验。
- [Vercel React Best Practices For My App](../20-engineering/vercel-react-best-practices-for-my-app.md)：将 Vercel React/Next.js 性能规则映射到当前仓库的具体文件与优化动作。
- [Preview Delivery And CDN Plan](../20-engineering/preview-delivery-and-cdn-plan.md)：梳理 preview artifact 当前的对象存储 / CDN 分发现状、剩余瓶颈与后续提速方向。
- [Dependency Execution Strategy Heuristic Spec](../20-engineering/dependency-execution-strategy-heuristic-spec.md)：在治理边界内按依赖复杂度与平台交付能力自动选择构建策略，并把平台控制缓存/CDN 纳入 compatible delivery。
- [Compatible Bundled Delivery Spec](../20-engineering/compatible-bundled-delivery-spec.md)：将 compatible externals 从远端多模块拉取优化为平台控制的单文件/少量 chunk 交付。
- [AI Misreasoning Guardrails Log](../20-engineering/ai-misreasoning-guardrails-log.md)：持续记录 AI 因为工具描述、错误语义或系统 contract 不清而产生的误判，并追踪 guardrail 补点。
