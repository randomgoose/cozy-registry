Status: proposed
Owner: engineering
Last updated: 2026-04-06
Source of truth: yes

# Live Style Preview And Committed Artifact Spec

本文定义 Cozy Registry 未来在 Web 端支持轻量样式调整时的双轨 preview 模型：

- `live style preview`
- `committed artifact preview`

目标不是在两者之间二选一，而是明确它们各自负责什么、共享什么 contract、以及何时从 runtime overlay 切回正式 artifact。

## 1. Problem Statement

随着项目内 theme 与样式资源逐渐体系化，Web 端会出现一种很真实的需求：

- 用户不想重写组件
- 只是想轻量调整样式并立即观察效果
- 这类工作通常不需要 AI 介入

如果每一次样式调整都强制重新构建 artifact：

- 交互会很钝
- 页面反馈不够即时
- 用户难以把它当作轻量 style editing 工具

但如果长期只靠 runtime 覆盖：

- preview 与 artifact 会分叉
- thumbnail / docs / share / diagnostics 会失去统一真相
- 系统又会回到“运行时拼系统”的老路

因此需要明确双轨模型：

1. runtime overlay 负责即时试验
2. artifact rebuild 负责正式固化

## 2. Goals

- 支持 Web 端对 theme / style 做轻量即时调整
- 保持 preview 的低延迟和良好交互体验
- 不让 runtime overlay 破坏 artifact-first 的正式系统 contract
- 让 preview / docs / thumbnail / share 最终仍建立在 committed artifact 上

## 3. Non-Goals (v1)

以下能力不属于本 spec 第一阶段：

- 运行时直接修改组件源码结构
- 运行时改写 registryDependencies
- 用 runtime overlay 取代正式 artifact build
- 把 AI-assisted code rewrite 与 style overlay 混为一谈

## 4. Decision

系统正式采用双轨模型：

### 4.1 Live Style Preview

用于：

- 即时观察样式变更
- 低延迟 theme/token/class/style context 调整
- 草稿态预览

本质上是：

- runtime overlay
- preview-only compatibility layer

### 4.2 Committed Artifact Preview

用于：

- 正式预览
- share / docs / thumbnail / artifact cache
- manifest / status API / diagnostics 的统一真相

本质上是：

- build-time artifact
- committed system state

## 5. Core Principle

一句话原则：

- **编辑时 runtime**
- **提交后 rebuild**

也就是说：

- runtime overlay 负责“即时试”
- committed artifact 负责“正式真相”

## 6. What Runtime Overlay Is Allowed To Change

runtime overlay 应只覆盖：

- theme token patch
- CSS variables
- theme variant
- 纯展示层 props
- class / spacing / color / radius / typography 等样式型参数

runtime overlay 不应长期承担：

- 组件源码逻辑变更
- import graph / dependency graph 变更
- registry item 结构性修改
- source-level hard dependency resolution

## 7. Formal State Model

### 7.1 Live Draft State

页面在用户调整样式时，允许存在一个 draft preview state，例如：

```json
{
  "mode": "live-style-preview",
  "draftThemePatch": {
    "...": "..."
  }
}
```

这个 state：

- 只在当前页面 / 当前 session / 当前编辑上下文内有效
- 不等同于正式 artifact
- 不应被默认分享或当作发布真相

### 7.2 Committed State

一旦用户保存 / 发布：

- theme / style 变更写入正式资源
- committed artifact 被重新构建
- manifest / diagnostics / thumbnail 都转向新的 committed state

## 8. Runtime Contract

### 8.1 Preview Runtime Input

iframe runtime 应支持接收：

- resolved theme context
- draft theme patch
- optional display-only props patch

### 8.2 Source of Truth

runtime overlay 的 source of truth 只存在于当前编辑页面状态中，不应直接改写 artifact identity。

### 8.3 User Semantics

UI 需要明确区分：

- `Draft preview`
- `Published preview`

避免用户误以为正在看到的是已经提交的正式 artifact。

## 9. Committed Artifact Contract

committed artifact 仍是以下能力的正式基础：

- preview share
- preview status API
- thumbnail
- docs page
- artifact cache / warm cache
- diagnostics

因此：

- runtime overlay 不可替代 committed artifact
- theme / style 的正式解析结果最终必须回到 artifact rebuild

## 10. Transition From Live To Committed

### 10.1 Save / Publish Trigger

当用户执行：

- save
- publish
- apply theme change

系统应：

1. 持久化正式 theme / style 资源
2. 触发相关 artifact rebuild
3. 更新 committed preview 的状态

### 10.2 Rebuild Policy

不要求每一个 runtime patch 都立即同步重建。

推荐：

- 输入时 runtime 覆盖即时生效
- save 时强制触发 rebuild
- optional：空闲期 debounce / coalesced rebuild

## 11. Theme Relationship

theme 在当前系统里应被视为：

- design context dependency
- render-time enhancement
- artifact input

而不是默认的 hard code dependency。

这意味着：

- theme 缺失通常不应阻塞 UI / block 构建成功
- 但 committed artifact 仍应记录 resolved theme context

## 12. Why Both Tracks Are Needed

### 12.1 Why Runtime Overlay Is Needed

因为未来 Web 端轻量调样式的体验要求：

- 低延迟
- 直接观察结果
- 不要求每次变更都触发构建

### 12.2 Why Artifact Rebuild Is Still Needed

因为系统仍然需要统一真相来支撑：

- cache
- docs
- share
- thumbnails
- diagnostics
- agent / MCP reasoning

## 13. UI Recommendations

建议 UI 至少显式区分：

- `Draft preview`
- `Published preview`
- `Rebuilding preview...`

如果当前只是 runtime overlay 生效，而 committed artifact 尚未更新，应明确告知用户：

- 当前看到的是草稿态效果

## 14. Diagnostics

建议 status / diagnostics 能输出：

- `previewMode: live-style-preview | committed-artifact`
- `draftThemePatchPresent: boolean`
- `resolvedThemeRef`
- `resolvedThemeSource`
- `committedArtifactStatus`

## 15. Recommended Rollout

### Phase 1

- 明确双轨 contract
- 页面状态支持 runtime theme patch
- UI 明确区分 draft / published

### Phase 2

- iframe runtime 支持接收 theme patch
- 不触发 source rewrite，只做 style overlay

### Phase 3

- save / publish 触发 artifact rebuild
- status API / UI 反映 committed preview freshness

### Phase 4

- 将 theme-driven invalidation、thumbnail、docs page 与 committed artifact 对齐

## 16. Recommended Principle

不要把 runtime overlay 设计成：

- 长期正式真相

而应把它设计成：

- 轻量编辑体验层

系统最终的正式结果，仍然应回到 committed artifact。

## 17. Related Docs

- [Project Resource Relationship Spec](./project-resource-relationship-spec.md)
- [Preview Artifact Capability Model Spec](./preview-artifact-capability-model-spec.md)
- [Preview Artifact Retrospective](./preview-artifact-retrospective.md)
- [Story Preview UX / Performance Spec](./story-preview-ux-performance-spec.md)
