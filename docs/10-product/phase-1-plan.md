Status: active
Owner: product
Last updated: 2026-03-20
Source of truth: yes

# Phase 1 Plan

## 目标

Phase 1 的目标不是“让资产能发布出来”，而是：

**让设计师产出的 `registry:block` bundle 能被 AI / 开发安装到项目里，并且后续可以识别、比较、升级。**

这是 Cozy Registry 与“复制粘贴 TSX”方案的核心区别。

## 核心用户

- 具备 Vibe coding 能力和意愿的设计师
- 负责检索、安装、升级这些资产的 AI agent

## 第一优先级资产

### `registry:block`

Phase 1 的第一优先级是 `registry:block`，而不是完整的组件库治理。

原因：

- block 更符合设计师在 Figma Make 等工具中的真实产出形态
- block 往往不是单文件，而是带本地引用的 bundle
- block 的变化频率高，更需要版本追踪和升级能力

### block bundle 的含义

一个 block 可以包含：

- 多个本地源码文件
- 相对 import
- CSS 文件
- 动效、canvas、WebGL 等实现
- 为预览和安装所需的辅助文件

Phase 1 必须把这种 bundle 视为一等公民，而不是把它压缩成“单文件 TSX”心智。

## 最小闭环

Phase 1 的最小闭环是：

1. 设计师发布一个 block bundle
2. AI / 开发把这个 block 安装到项目里
3. 项目记录自己装了哪个版本
4. Registry 出现新版本时，系统能识别并提示可升级
5. AI / 开发能切换到目标版本

如果没有第 3、4、5 步，这个产品就仍然只是一个更高级的复制粘贴面板。

## 必做能力

### 1. Block bundle 规范

- 支持多文件 block
- 支持相对引用和本地样式文件
- 支持稳定的入口和版本快照
- 升级时不能破坏 bundle 结构

### 2. 稳定安装坐标

每个资产必须有稳定身份：

- `@owner/name`
- `version`
- `source`

这是安装、升级、回滚和 lockfile 的基础。

### 3. 安装记录

项目侧至少要有一种可读取的安装记录方式：

- lockfile
- 代码头注释
- 或二者组合

### 4. 版本读取与升级判断

系统需要能够回答：

- 当前项目安装的是哪个版本
- Registry 最新版本是什么
- 是否可升级
- 升级目标是什么

### 5. 升级入口

Phase 1 不一定要有复杂的自动代码迁移，但至少要有：

- 读取指定版本
- 比较当前与目标版本
- 执行安装或重新安装
- 明确升级来源和目标版本
- 冲突时默认停止，而不是静默覆盖本地改动

### 6. AI 侧升级语义

MCP 不应只停留在 `list/get/publish`，而要逐步具备：

- 查询版本
- 判断是否可升级
- 给出升级建议
- 在受控上下文里执行升级
- 在远程 AI 场景里基于 `projectStatus` 快照分析项目当前安装状态

### 7. AI-first 项目状态能力

对于 Figma Make 等远程 Vibe coding 场景，Phase 1 还必须具备：

- 读取项目当前已安装的 Cozy items
- 汇总哪些 item 存在可升级版本
- 用结构化结果回答“现在项目里装了什么、下一步该做什么”
- 在拿不到真实 `projectRoot` 时，仍能基于 `projectStatus` 快照继续工作

## 非目标

Phase 1 不做：

- 通用团队组件仓库定位
- 完整的 `registry:ui` 治理体系
- 重型 CLI 生态
- 可视化 diff 平台
- 全面的组织权限产品

## 资产优先级

1. `registry:block`
2. `registry:theme`
3. `registry:ui`

说明：

- `theme` 对 block 的风格一致性和 AI 消费同样重要
- `component` 很重要，但更适合在 block 生态中逐步沉淀和抽取

## 验收标准

Phase 1 完成时，至少满足以下条件：

1. 设计师在 Vibe coding 工具里更新一个 block 后，能发布新版本
2. AI / 开发能把这个 block 安装到项目中，并保留版本来源
3. 系统能识别项目当前安装版本
4. 系统能告诉用户是否存在可升级版本
5. 用户能安装或切换到指定版本
6. 多文件 block 在升级后仍保持完整 bundle 结构
7. 本地已修改文件在默认升级流程中不会被静默覆盖
8. Figma Make 等远程 AI 能基于 `projectStatus` 快照回答项目状态与升级建议

## 工作线拆分

### Registry 侧

- block bundle 规范
- versions API
- install URL 规范
- 指定版本读取

### Project 侧

- lockfile 设计
- 安装标记
- 升级检查机制
- 安装协议与执行入口

### AI 侧

- MCP 版本查询
- MCP 升级建议
- MCP 项目状态分析
- collection / theme 上下文

## 参考

- 安装协议草案： [install-protocol.md](../20-engineering/install-protocol.md)
- 版本与 lockfile： [versioning-and-lockfile.md](../20-engineering/versioning-and-lockfile.md)
