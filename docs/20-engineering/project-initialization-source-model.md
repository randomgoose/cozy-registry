Status: draft
Owner: engineering
Last updated: 2026-04-11
Source of truth: no

# Project Initialization Source Model

## Decision

V1 中，starter kit 应被视为 **project initialization template**，而不是持续关联的 starter source。

这意味着：

- 用户在创建 project 时选择 `empty` 或某个 starter kit
- 若选择 starter kit，系统将 starter 内容写为 project 初始资源
- 创建完成后，这些资源就是 project 自己的 canonical content
- V1 不要求保留和 starter source 的长期关联

## Recommended Source Model

V1 推荐使用 **repo templates** 作为 starter 内容来源。

也就是说，starter kit 的默认资源应来自：

- repo 内维护的一组 template definitions
- 由 project initialization 流程生成 project-scoped registry items

而不是：

- 直接 clone 某个共享 registry project
- 在 project 和 starter source 之间保留长期关系
- 依赖 attach/link 语义

## Why Repo Templates First

这个方向在 V1 更稳，因为它：

- 数据模型最简单
- 用户心智最简单
- 不需要处理 starter source 升级和 project 同步
- 与当前 canonical project item 模型一致

## Configuration Entry

当前建议把 starter kit 的初始化配置集中在：

- [starter-kits.ts](/Users/chenchen/Documents/GitHub/my-app/lib/starter-kits.ts)
- [starter-template-loader.ts](/Users/chenchen/Documents/GitHub/my-app/lib/starter-template-loader.ts)
- [project-initialization.ts](/Users/chenchen/Documents/GitHub/my-app/lib/project-initialization.ts)

其中每个 starter kit 至少应定义：

- `defaultInstall.defaultThemeResourceRefs`
- `defaultInstall.foundations`
- `defaultInstall.resources`

`defaultInstall.resources` 应记录：

- 资源 key
- 资源 type
- 展示 title
- 来源模板标识，例如 `repo-template`

如果 starter template 之间存在依赖，依赖应在 template manifest 中显式声明，而不是依赖扫描推断。

原因：

- 与现有 `registryDependencies` contract 对齐
- 与现有 Cozy stub / de-vendor 语义对齐
- 避免 project initialization 引入第二套隐式依赖模型

## V1 Implementation Sequence

推荐顺序：

1. 创建 project 时支持 `empty` / `primitives kit`
2. 在代码里集中管理 starter kit 默认初始化内容
3. 为 `defaultInstall.resources` 提供 repo template 实现
4. 在 project 创建成功后，把这些模板 materialize 成 project-scoped registry items

当前实现状态：

- `starter-kits.ts` 定义 starter kit manifest
- `starter-template-loader.ts` 负责读取 repo templates
- `project-initialization.ts` 负责将模板实例化为 project-scoped registry items
- 若 starter kit 包含 `registry:theme` 模板，materializer 还应回写 project 的 `defaultThemeResourceRefs`
- 因此 V1 中 project 默认 theme 也应优先来自 materialized local theme，而不是外部 starter refs

## Non-Goals

V1 不做：

- starter source 与 project 的长期关联
- kit sync
- source diff / rebase
- starter source 升级提示
