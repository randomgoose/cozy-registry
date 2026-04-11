Status: draft
Owner: product
Last updated: 2026-04-11
Source of truth: no

# Primitives Kit Baseline

> 当前代码里的默认安装内容以 [lib/starter-kits.ts](/Users/chenchen/Documents/GitHub/my-app/lib/starter-kits.ts) 为准；本文档用于解释产品意图和 baseline 范围。V1 中，真正的 starter 资源清单应集中定义在 `defaultInstall.resources`。

## Goal

`primitives kit` 是 project 创建阶段的最小 starter option。

在 V1 中，它应被视为 **一次性 project initialization template**，而不是会和 project 持续保持关联的 starter source。

它的目标不是一次性安装完整 design system，而是给新 project 一个足够稳的基础起点：

- 一个 project-scoped starter theme
- 一组高频基础组件
- 清晰的后续扩展方向

## Project Creation Entry

创建 project 时，V1 先只支持两种入口：

- `Create from empty`
- `Create from primitives kit`

如果用户选择 `Create from primitives kit`，其语义应是：

- 在创建时把这套 baseline 当作 project 初始内容
- 创建完成后，这些内容就是 project 自己的内容
- 后续不再额外维护和 starter source 的持续关联

## Included Theme

V1 中，`primitives kit` 会 materialize 一份 project-scoped theme：

- Cozy Default Theme

其作用是：

- 为 starter primitives 提供基础 design tokens
- 成为新 project 的默认 theme resource
- 避免 project 创建后仍依赖外部 starter source 的 theme refs

## Included Foundations

- Color tokens
- Typography tokens
- Radius tokens
- Spacing tokens

## Included Primitives

- Button
- Dialog

当前实现说明：

- V1 先只用 `button -> dialog` 这条最小链路验证 starter template materialization
- `dialog` 显式依赖 `button`
- 其他 primitives 会在这条最小链路跑稳后再逐步加入

## Initialization Source Model

V1 推荐把 starter kit 视为 repo 内的初始化模板集合，而不是 registry source 的持续映射。

因此默认安装内容的代码结构应是：

- `defaultThemeResourceRefs`
- `foundations`
- `resources`

其中 `resources` 表示：

- project 创建时准备写入的初始资源清单
- 这些资源的类型，例如 `registry:theme`、`registry:ui`
- 这些资源未来从哪个 repo template 生成

当前实现说明：

- `themes/cozy-default` 会先被 materialize 成 project-scoped `registry:theme`
- project 的 `defaultThemeResourceRefs` 会被回写到这份本地 theme
- 然后再继续 materialize `button`、`dialog`

## Non-Goals

这个 baseline 暂不包括：

- blocks
- data vis
- app-shell templates
- page-level starters

这些内容后续应作为独立 starter package 或 kit 继续扩展，而不是继续塞进 `primitives kit`。
