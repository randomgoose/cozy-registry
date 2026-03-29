Status: active
Owner: shared
Last updated: 2025-02-14
Source of truth: yes

# Product Summary

## 一句话

Cozy Registry 是一个面向 Web 开发的 AI-native registry，让设计师、开发者和 AI agent 可以发布、发现、预览和消费 blocks、components 和 themes。

## 核心价值

- 让设计师直接在 Figma Make 等 Vibe coding 工具中创建和迭代可消费的前端资产
- 让这些资产以源码形式进入 Web 开发流程，而不是停留在 demo 或设计稿
- 让 AI agent 通过结构化 API 和 MCP 可靠发现、安装、升级这些资产
- 让团队以私有部署方式管理 blocks、components、themes、projects 和权限范围

## 当前产品边界

- 主锚点是 Web 前端资产，不做泛设计资产平台
- 当前最强切入场景是 landing、marketing、campaign、feature section 等设计师高参与场景
- 第一优先级是 `registry:block`，允许以 bundle 形式包含本地引用和辅助文件
- `registry:ui` 同样重要，但作为第二层沉淀能力推进
- 当前阶段不把自己定义成通用组件仓库产品
- 主形态是“复制源码并带走”，不是 npm 包管理
- 主方向是组织/project 自部署，不以公开组件市场为核心

## 核心用户

- 具备 Vibe coding 能力和意愿的设计师
- 负责安装、检索、升级前端资产的 AI agent

## 核心对象

- `registry:block`: 场景型模块，如 Hero、FAQ、Pricing、带特效的 section、实验性 Web 区块
- `registry:ui`: 复用型 UI 组件，如 Button、Card、Input，以及更完整的组件库条目
- `registry:theme`: 全局主题和 design tokens
- `project`: 一组有业务、协作和权限边界的 registry item
- `policy`: API key 可见范围和访问限制

## 核心链路

1. 用户通过 Web、MCP 或外部工具发布组件
2. 设计师可在 Figma Make 等工具中直接创建或迭代 block / component / theme
3. 资产以源码文件和元数据形式存入数据库，并保留可安装、可升级的版本关系
4. Web UI 展示组件详情、版本和预览
5. Registry API 输出 shadcn 兼容格式
6. MCP 为 AI 客户端提供发现、读取、发布、升级能力
