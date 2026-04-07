Status: proposed
Owner: engineering
Last updated: 2026-04-06
Source of truth: yes

# Project Resource Relationship Spec

本文定义 Cozy Registry 中 project 内资源之间的默认关系模型。

目标不是让 project 变成一个任意资源图系统，而是先把最真实、最常见的一类关系做通：

- project default theme
- resource-level theme override

这会让 preview、artifact build、docs page 与 install protocol 在同一套设计上下文中工作，而不是每条链路各自猜测 theme。

## 1. Problem Statement

现在一个 project 下会逐渐出现多类资源：

- `registry:ui`
- `registry:block`
- `registry:theme`
- 未来可能还有 `icons`、`typography`、`tokens`、`docs config`

如果这些资源之间完全靠手工显式连接，会出现几个问题：

- 同一 project 下的多个 UI 组件要重复声明同一个 theme
- preview、install、docs page 很难保持一致
- story / docs artifact 缺少统一设计上下文
- project 作为设计系统边界的语义无法被系统表达

因此，project 不应只是分组容器，也应承担“默认设计上下文”的角色。

## 2. Goals

- 让 project 可以声明默认 theme 资源
- 让单个 resource 可以显式覆盖 project 默认 theme
- 让 preview、artifact build、docs page、install 共享同一套 theme resolution contract
- 让最终解析结果在 UI、manifest、status API、diagnostics 中可见

## 3. Non-Goals (v1)

以下能力不属于本次第一阶段：

- 一开始就抽象成通用 `project defaults` 系统
- 同时支持 icons / typography / tokens / docs config 的完整默认关系
- 自动把 project default theme 写回所有 UI 资源的硬依赖主记录
- 自动跨 project 推导资源关系

## 4. Decision

本 spec 第一阶段只支持：

- `project.defaultThemeResourceRef`
- `resource.meta.themeResourceRef`

统一解析顺序为：

1. resource 显式覆盖 `themeResourceRef`
2. project 默认 `defaultThemeResourceRef`
3. 无 theme

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

- project default theme 是绑定在 canonical project namespace 上的

## 6. Data Model

### 6.1 Project Default

短期建议直接在 `registry_projects` 上增加字段：

- `defaultThemeResourceRef`

可选：

- `defaultThemeResourceId`

如果两者都存在，以 canonical ref 作为对外 contract，以 id 作为内部快速关联。

### 6.2 Resource Override

单个 resource 的 meta 中允许可选字段：

- `themeResourceRef`

示例：

```json
{
  "themeResourceRef": "@indeed-cozy/marketing/theme"
}
```

语义：

- 当前 resource 不继承 project 默认 theme
- 当前 resource 显式绑定自己的 theme

### 6.3 v1 Scope Limitation

第一阶段不引入：

- `defaultIconsResourceRef`
- `defaultTypographyResourceRef`
- `defaultDocsConfigRef`

这些未来如有必要，再演进为更通用的 defaults 结构。

## 7. Resolution Contract

### 7.1 Resolution Order

所有系统统一按以下顺序解析 theme：

1. `resource.meta.themeResourceRef`
2. `project.defaultThemeResourceRef`
3. `none`

### 7.2 Resolution Output

所有消费方都应能得到结构化解析结果，例如：

```json
{
  "resolvedThemeRef": "@indeed-cozy/ds/theme",
  "source": "project-default"
}
```

或：

```json
{
  "resolvedThemeRef": "@indeed-cozy/marketing/theme",
  "source": "resource-override"
}
```

若无 theme：

```json
{
  "resolvedThemeRef": null,
  "source": "none"
}
```

### 7.3 Context, Not Hard Dependency (v1)

本 spec 第一阶段明确将 project default theme 定义为：

- **render / install / docs context resolution**

而不是：

- 自动持久化为 resource 的 item-level hard dependency

也就是说：

- preview / docs / install 可以自动继承 project default theme
- 但系统不应在第一阶段悄悄把这层 project default 写回每个 resource 的正式 `registryDependencies`

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

- 先解析 resource override
- 再解析 project default
- 若命中 theme，则将该 theme 作为 preview design context 注入

### 9.2 Artifact Build

artifact build 时应将 theme resolution 结果前移并固化到 manifest / runtime plan，而不是让 iframe 请求时再次猜测。

### 9.3 Multi-story Preview

multi-story preview 页面中的各 story 应共享同一个 resolved theme context，除非 story 所属 resource 显式覆盖。

## 10. Install Protocol

### 10.1 v1 Behavior

第一阶段 install protocol 不强制自动安装 project default theme。

更稳的 v1 行为是：

- 安装 UI 时解析 project default theme
- 在 install result / diagnostics 中明确提示
- 提供“建议一起安装 / 自动带上”的产品入口

### 10.2 Future Behavior

后续可再决定：

- install 是否自动带 project default theme
- 是否写入 install provenance / lockfile context

但这不应阻塞 preview / docs / artifact 先把 project default theme 做通。

## 11. Diagnostics and Observability

theme resolution 结果必须是可见的，不允许成为黑盒。

建议至少在以下位置展示：

- preview artifact manifest
- preview status API
- registry detail page
- project detail page

推荐输出字段：

- `resolvedThemeRef`
- `resolvedThemeSource`

其中 `resolvedThemeSource` 取值建议为：

- `resource-override`
- `project-default`
- `none`

## 12. Error Semantics

系统必须区分“没有配置”和“配置了但坏了”。

推荐 diagnostics：

- `NO_THEME_RESOLVED`
- `PROJECT_THEME_NOT_FOUND`
- `PROJECT_THEME_FORBIDDEN`
- `RESOURCE_THEME_OVERRIDE_NOT_FOUND`
- `RESOURCE_THEME_OVERRIDE_FORBIDDEN`

preview / docs 不应在 project default theme 失效时默默回退成无 theme 而不提示。

## 13. Product Semantics

### 13.1 Project Has Default Theme, Resource Has No Override

- 自动应用 project default theme

### 13.2 Resource Has Explicit Override

- override 优先
- project default 不再生效

### 13.3 Default Theme Missing or Forbidden

- preview / docs 不应静默失败
- 必须返回明确的可诊断状态

## 14. Recommended Rollout

### Phase 1

- `registry_projects.defaultThemeResourceRef`
- `registry_items.meta.themeResourceRef`
- 统一 resolution helper

### Phase 2

- preview / artifact build / multi-story preview page 消费统一 resolution helper
- manifest / status API 暴露 resolved theme 和 source

### Phase 3

- docs page rendering 消费统一 resolution helper
- project detail / item detail 页面展示 resolution 结果

### Phase 4

- install protocol 消费统一 resolution helper
- 决定是否自动安装或只做提示

## 15. Open Decisions

以下问题仍需 tech design 拍板：

1. `defaultThemeResourceRef` 是否需要同步存 `defaultThemeResourceId`
2. install protocol 是自动带 theme，还是默认只提示
3. docs page 是否需要显式显示 “Theme source: project default / override”
4. 后续是否把 theme-only 模型推广为通用 project defaults 模型

## 16. Recommended Principle

project 应被视为：

- identity namespace
- design context boundary

而不是纯分组标签。

第一阶段从 `defaultThemeResourceRef` 做起，是最小、最真实、最能立刻提升 preview / docs / install 一致性的切口。

## 17. Current Implementation Status

截至当前实现，已经落地的部分：

- `registry_projects.defaultThemeResourceRef`
- resource-level `meta.themeResourceRef` override
- 统一的 theme resolution helper
- preview route、artifact build、multi-story preview page、status API 共享同一套 resolution order
- UI 已可见：
  - `resolvedThemeResourceRef`
  - `resolvedThemeSource`
- artifact worker 已开始把 resolved theme CSS 带入 `preview.html`

仍未完全收口的部分：

- install protocol 还未正式消费 project-level resolved theme relationship
- theme 更新与关联 artifact freshness 的强一致策略还未完全定案
- theme resource 的长期 canonical format 仍待从 CSS-first 逐步演进到更结构化的 token model

## 18. Related Docs

- [Project-Scoped Registry Identity Spec](./project-scoped-registry-identity-spec.md)
- [Registry Dependency Management Spec](./registry-dependency-management-spec.md)
- [Multi-Story Preview Page Spec](./multi-story-preview-page-spec.md)
- [Preview Artifact Capability Model Spec](./preview-artifact-capability-model-spec.md)
