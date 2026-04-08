Status: proposed
Owner: engineering
Last updated: 2026-04-08
Source of truth: yes

# Project Resource Relationship Spec

本文定义 Cozy Registry 中 project 内资源之间的默认关系模型。

目标不是让 project 变成一个任意资源图系统，而是先把最真实、最常见的一类关系做通：

- project default theme layers
- resource-level theme layers

这会让 preview、artifact build、docs page 与 install protocol 在同一套设计上下文中工作，而不是每条链路各自猜测 theme。

## 1. Problem Statement

现在一个 project 下会逐渐出现多类资源：

- `registry:ui`
- `registry:block`
- `registry:theme`
- 未来可能还有 `icons`、`typography`、`tokens`、`docs config`

如果这些资源之间完全靠手工显式连接，会出现几个问题：

- 同一 project 下的多个 UI 组件要重复声明同一个基础 theme
- 领域型 token（例如 `chart-color-tokens`、`components`）会被误建模成 override
- preview、install、docs page 很难保持一致
- story / docs artifact 缺少统一设计上下文
- project 作为设计系统边界的语义无法被系统表达

因此，project 不应只是分组容器，也应承担“默认设计上下文”的角色。

## 2. Goals

- 让 project 可以声明默认 theme 资源列表
- 让单个 resource 可以追加自己的 theme layers
- 让 preview、artifact build、docs page、install 共享同一套 theme resolution contract
- 让最终解析结果在 UI、manifest、status API、diagnostics 中可见

## 3. Non-Goals (v1)

以下能力不属于本次第一阶段：

- 一开始就抽象成通用 `project defaults` 系统
- 同时支持 icons / typography / tokens / docs config 的完整默认关系
- 自动把 project default theme layers 写回所有 UI 资源的硬依赖主记录
- 自动跨 project 推导资源关系
- resource-level “替换 project defaults”
- resource-level “清空 project defaults”

## 4. Decision

本 spec 第一阶段升级为数组模型：

- `project.defaultThemeResourceRefs: string[]`
- `resource.meta.themeResourceRefs?: string[]`

统一解析顺序为：

1. 读取 `project.defaultThemeResourceRefs`
2. 读取 `resource.meta.themeResourceRefs`
3. 先 project，后 resource
4. 去重但保留顺序
5. 得到 `resolvedThemeResourceRefs`

resource-level theme refs 的语义是 **append layers**，不是 override。

## 5. Identity and Scope

### 5.1 Project Identity Must Use Canonical Namespace

本 spec 依赖 [Project-Scoped Registry Identity Spec](./project-scoped-registry-identity-spec.md) 中的正式身份模型：

- canonical identity = `owner + project + name`

因此这里的 `project` 也必须理解为：

- canonical project namespace
- 稳定、不可漂移的 identity component

不能把一个可随时变更的 display slug 直接当作 project default 关系的唯一锚点。

### 5.2 Current Compatibility Paths

在过渡期内，部分 route / UI 仍可能使用：

- `owner + name + ?project=...`

但这只是兼容形式，不改变本 spec 的长期前提：

- project default theme layers 是绑定在 canonical project namespace 上的

## 6. Data Model

### 6.1 Project Defaults

短期建议直接在 `registry_projects` 上增加字段：

- `defaultThemeResourceRefs`

可选：

- `defaultThemeResourceIds`

如果两者都存在，以 canonical refs 作为对外 contract，以 ids 作为内部快速关联。

示例：

```json
{
  "defaultThemeResourceRefs": [
    "@indeed-cozy/ds/theme"
  ]
}
```

### 6.2 Resource Theme Layers

单个 resource 的 meta 中允许可选字段：

- `themeResourceRefs`

示例：

```json
{
  "themeResourceRefs": [
    "@indeed-cozy/ds/components"
  ]
}
```

语义：

- 当前 resource 在 project 默认 theme layers 之上继续追加自己的 theme layers
- 当前 resource 不会替换掉 project 默认 theme

### 6.3 Compatibility Read Layer

在当前开发阶段，读取层可以临时兼容旧单值字段：

- `defaultThemeResourceRef`
- `themeResourceRef`

并将其视为单元素数组，但新的写入与内部真相应统一成数组模型：

- `defaultThemeResourceRefs`
- `themeResourceRefs`

一句话：

- **读兼容**
- **写收口**

## 7. Resolution Contract

### 7.1 Resolution Order

所有系统统一按以下顺序解析 theme layers：

1. `project.defaultThemeResourceRefs`
2. `resource.meta.themeResourceRefs`
3. append
4. 去重但保留顺序
5. `none`（当最终列表为空时）

### 7.2 Resolution Output

所有消费方都应能得到结构化解析结果，例如：

```json
{
  "resolvedThemeResourceRefs": [
    "@indeed-cozy/ds/theme",
    "@indeed-cozy/ds/components"
  ],
  "resolvedThemeLayerSources": [
    "project-default",
    "resource-layer"
  ]
}
```

或仅 project default：

```json
{
  "resolvedThemeResourceRefs": [
    "@indeed-cozy/ds/theme"
  ],
  "resolvedThemeLayerSources": [
    "project-default"
  ]
}
```

若无 theme：

```json
{
  "resolvedThemeResourceRefs": [],
  "resolvedThemeLayerSources": []
}
```

### 7.3 Context, Not Hard Dependency (v1)

本 spec 第一阶段明确将 project theme layers 定义为：

- **render / install / docs context resolution**

而不是：

- 自动持久化为 resource 的 item-level hard dependency

也就是说：

- preview / docs / install 可以自动继承 project default theme layers
- 系统不应在第一阶段悄悄把这些 project theme layers 写回每个 resource 的正式 `registryDependencies`

否则 project context 和 resource-level hard dependency 会混在一起。

## 8. Consumers

以下链路必须使用同一套解析规则：

- preview route
- preview artifact build
- multi-story preview page
- docs page rendering
- install protocol
- preview status API

## 9. Preview and Artifact Behavior

### 9.1 Preview

preview 在渲染 UI / block 资源时：

- 先解析 project default layers
- 再解析 resource theme layers
- 按最终 `resolvedThemeResourceRefs` 顺序收集 CSS
- 按同顺序注入 preview design context

平台不额外发明覆盖规则，而是让浏览器按正常 CSS cascade 生效：

- 前面的 layer 提供基础 token
- 后面的 layer 可以补充或覆盖前面的 token

### 9.2 Artifact Build

artifact build 时应将 theme layers resolution 结果前移并固化到 manifest / runtime plan，而不是让 iframe 请求时再次猜测。

### 9.3 Multi-story Preview

multi-story preview 页面中的各 story 应共享同一个 resolved theme layers context，除非 story 所属 resource 追加自己的 resource layers。

## 10. Install Protocol

### 10.1 v1 Behavior

第一阶段 install protocol 不强制自动安装全部 project default theme layers。

更稳的 v1 行为是：

- 安装 UI 时解析最终 `resolvedThemeResourceRefs`
- 在 install result / diagnostics 中明确展示 theme layers 的顺序与来源
- 提供“建议一起安装 / Include theme layers”的显式入口

这里可以参考 shadcn registry 与 jsrepo 的心智：

- 安装面板显式展示 registry dependencies / config requirements
- 不把所有设计上下文都静默写入用户工程
- 先让用户看见“这个组件依赖哪些额外上下文”，再决定是否一起带上

因此，theme layers 在 install 中更像：

- design-context dependencies

而不是：

- 普通 npm package dependencies
- 或被静默内联掉的隐藏配置

### 10.2 Future Behavior

后续可再决定：

- install 是否自动带 project default theme layers
- 是否写入 install provenance / lockfile context
- 是否将 theme layers 与 registry dependencies 并排展示为两类依赖

但这不应阻塞 preview / docs / artifact 先把 project default theme layers 做通。

## 11. Diagnostics and Observability

theme layers resolution 结果必须是可见的，不允许成为黑盒。

建议至少在以下位置展示：

- preview artifact manifest
- preview status API
- registry detail page
- project detail page

推荐输出字段：

- `resolvedThemeResourceRefs`
- `resolvedThemeLayerSources`

其中 layer source 取值建议为：

- `resource-layer`
- `project-default`

UI 文案仍然可以继续使用轻量词汇：

- `Project theme resources`
- `Component theme resources`
- `Resolved theme layers`

不需要额外引入新的产品术语。

## 12. Error Semantics

系统必须区分“没有配置”和“配置了但坏了”。

推荐 diagnostics：

- `NO_THEME_RESOLVED`
- `PROJECT_THEME_LAYER_NOT_FOUND`
- `PROJECT_THEME_LAYER_FORBIDDEN`
- `RESOURCE_THEME_LAYER_NOT_FOUND`
- `RESOURCE_THEME_LAYER_FORBIDDEN`

preview / docs 不应在 project default theme layer 失效时默默回退成无 theme 而不提示。

## 13. Product Semantics

### 13.1 Project Has Default Theme Layers, Resource Has No Additional Layers

- 自动应用 project default theme layers

### 13.2 Resource Has Explicit Theme Layers

- resource theme layers 追加在 project default 之后
- 最终浏览器按注入顺序与正常 CSS cascade 生效

### 13.3 Theme Layer Missing or Forbidden

- preview / docs 不应静默失败
- 必须返回明确的可诊断状态

## 14. Recommended Rollout

### Phase 1

- `registry_projects.defaultThemeResourceRefs`
- `registry_items.meta.themeResourceRefs`
- 统一 resolution helper 升级为数组模型
- 读取层兼容旧单值字段

### Phase 2

- preview / artifact build / multi-story preview page 消费统一 resolution helper
- manifest / status API 暴露 resolved theme layers 和 source

### Phase 3

- docs page rendering 消费统一 resolution helper
- project detail / item detail 页面展示 resolution 结果

### Phase 4

- install protocol 消费统一 resolution helper
- 先展示 theme layers suggestion，再决定是否自动安装

## 15. Open Decisions

以下问题仍需 tech design 拍板：

1. `defaultThemeResourceRefs` 是否需要同步存 `defaultThemeResourceIds`
2. install protocol 是自动带 theme layers，还是默认只提示
3. docs page 是否需要显式显示 theme layer 顺序与来源
4. 后续是否把 theme-only 模型推广为通用 project defaults 模型
5. artifact freshness 是否需要直接记录 theme layer versions / fingerprints

## 16. Recommended Principle

project 应被视为：

- identity namespace
- design context boundary

而不是纯分组标签。

第一阶段从 `defaultThemeResourceRefs` 做起，是最小、最真实、最能立刻提升 preview / docs / install 一致性的切口。

## 17. Current Implementation Status

截至当前实现，已经落地的部分：

- `registry_projects.defaultThemeResourceRef`
- resource-level `meta.themeResourceRef`
- 统一的 theme resolution helper
- preview route、artifact build、multi-story preview page、status API 共享同一套 resolution order
- UI 已可见：
  - `resolvedThemeResourceRef`
  - `resolvedThemeSource`
- artifact worker 已开始把 resolved theme CSS 带入 `preview.html`

仍未完全收口的部分：

- 主模型仍是单值 theme；尚未升级到有顺序的 theme layers
- install protocol 还未正式消费 project-level resolved theme relationship
- install surfaces 仍未把 theme layers 当作 design-context dependencies 显式展示出来
- theme 更新与关联 artifact freshness 的强一致策略还未完全定案
- theme resource 的长期 canonical format 仍待从 CSS-first 逐步演进到更结构化的 token model

## 18. Related Docs

- [Project-Scoped Registry Identity Spec](./project-scoped-registry-identity-spec.md)
- [Registry Dependency Management Spec](./registry-dependency-management-spec.md)
- [Multi-Story Preview Page Spec](./multi-story-preview-page-spec.md)
- [Preview Artifact Capability Model Spec](./preview-artifact-capability-model-spec.md)
- [Component Style Organization Model Spec](./component-style-organization-model-spec.md)
