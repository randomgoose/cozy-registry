Status: proposed
Owner: engineering
Last updated: 2026-04-04
Source of truth: yes

# Soft-Allowed Compatible Artifact Spec

本文定义 Cozy Registry 中 `soft-allowed` 第三方依赖如何从当前过度保守的 `runtime-only` 默认策略，升级为更符合产品目标的 `compatible-artifact` 路径。

这份文档主要回答一个当前非常具体的问题：

- 为什么像 `recharts` 这样的浏览器侧 UI 依赖，即使没有被 block，也仍然会把整个组件拖进 `runtime preview only`
- 如何在不放弃依赖治理边界的前提下，把这类组件重新拉回 artifact-first

## 1. Problem Statement

当前实现已经有：

- `tier`
- `providerMode`
- `previewCapability`
- `artifactCapability`

但对 `soft-allowed` 依赖的默认处理仍然过于保守。

当前规则大致是：

- `trusted-built-in + managed-provider` -> 可进入 `managed-artifact`
- `trusted-built-in + compatible-external` 且有显式版本 -> 可进入 `compatible-artifact`
- 其他 `soft-allowed` 依赖 -> 直接 `runtime-only`

这会导致：

- 许多浏览器友好的常见库并没有被拒绝
- 但也没有资格进入 artifact-first
- 用户感知仍然是 “能发，但 preview 还是慢”

`recharts` 正是这一类典型例子。

## 2. Why This Happens Today

### 2.1 Governance is still binary for soft-allowed packages

当前 [third-party-dependency-governance.ts](/Users/chenchen/Documents/GitHub/my-app/lib/third-party-dependency-governance.ts) 中，`soft-allowed` 的默认结果是：

- `providerMode = compatible-external`
- `previewCapability = runtime-only`

也就是说：

- 平台已经承认它是 browser-compatible
- 但仍然不允许它进入任何 artifact-compatible 路径

### 2.2 Capability classification is stricter than the product goal

当前 [preview-artifact-jobs.ts](/Users/chenchen/Documents/GitHub/my-app/lib/preview-artifact-jobs.ts) 中：

- 只要存在非平台的 `runtime-only` bare dependency
- 整个组件就直接被分类成 `runtime-only`

而 `compatible-artifact` 只会在这类条件下出现：

- `providerMode === compatible-external`
- 且 `previewCapability === prebundle-supported`

由于 `soft-allowed` 永远拿不到 `prebundle-supported`，所以像 `recharts` 这样的包永远不可能进入 `compatible-artifact`。

## 3. Product Goal

平台真正追求的不是：

- “只有 fully managed 才能快”

而是：

- “只要 artifact shell 可以稳定生成，就应该尽量让组件走 artifact-first”

所以对很多浏览器侧、可 external、可 import-map 的依赖来说，更合理的目标是：

- 不要求它先进入 `managed-provider`
- 但允许它进入 `compatible-artifact`

## 4. Proposed Model

对 `soft-allowed` 依赖不再只有一种语义。

建议拆成两类：

### 4.1 `soft-allowed + runtime-only`

适用：

- 版本未知
- external contract 暂不稳定
- 无法安全生成 compatible artifact shell
- 仍需作为最后降级

### 4.2 `soft-allowed + compatible-external + compatible-preview-supported`

适用：

- 浏览器友好
- 可通过平台 import map / runtime plan externalize
- 有显式版本，或平台允许以兼容方式 external
- 不需要 managed provider 才能成立

这类依赖虽然不进入 `managed-artifact`，但应允许组件进入：

- `compatible-artifact`

### 4.3 Official boundary decision

本 spec 明确拍板：

- `soft-allowed` 默认不再被理解为“只能 runtime-only”
- 一部分 browser-safe package 可以直接进入 compatible lane
- 但必须满足明确条件，不能依赖实现层自由裁量

## 5. What Should Qualify

以下依赖类型应优先考虑进入 `soft-allowed compatible artifact`：

- 纯浏览器 React UI 库
- 数据展示 / 图表库
- headless UI / primitive UI 库
- 不依赖 Node builtins
- 不需要 native bindings
- 可稳定通过 ESM/CDN/import-map external 运行

典型例子：

- `recharts`
- `framer-motion` / `motion`
- 其他浏览器侧 chart / UI helper 包

## 6. Decision Contract

建议新增一个比 `prebundle-supported` 更贴近实际的能力决策，至少在内部语义上区分：

- `managed-prebundle-supported`
- `compatible-artifact-supported`
- `runtime-only`
- `blocked`

如果短期不想改类型名，也至少要改规则：

- `soft-allowed` 不应被默认写死为 `runtime-only`
- 某些 `soft-allowed + compatible-external` 依赖应允许 artifact worker 继续生成 compatible artifact shell

## 7. Recommended Classification Rules

### 7.1 When `soft-allowed` may remain `runtime-only`

满足以下任一条件时，保持 `runtime-only`：

- 未显式声明版本
- 包明显超出稳定 external 边界
- 平台当前没有 import map/runtime contract 可供加载
- thumbnail / artifact shell 不可安全生成

### 7.2 When `soft-allowed` should become compatible-artifact eligible

满足以下条件时，允许进入 compatible lane：

- 显式声明了版本
- 包通过 browser-safe boundary check
- provider mode 为 `compatible-external`
- 平台可以为其生成 runtime import map target
- artifact shell 可在不 bundle 该依赖的情况下稳定生成

这些条件是当前阶段的正式口径。

结论：

- 若缺少显式版本，则保守留在 `runtime-only`
- 若 import-map target 尚不存在，则保守留在 `runtime-only`
- 若 artifact shell 不稳定，则保守留在 `runtime-only`
- 满足以上条件时，不应再因为“它不是 fully managed”就阻止其进入 `compatible-artifact`

## 8. How This Changes `recharts`

当前 `recharts`：

- `tier = soft-allowed`
- `providerMode = compatible-external`
- `previewCapability = runtime-only`
- 最终组件掉进 `runtime-only`

目标状态：

- `tier = soft-allowed`
- `providerMode = compatible-external`
- `previewCapability = compatible-artifact-supported`
- 最终组件可进入 `compatible-artifact`

这意味着：

- 不需要把 `recharts` 升格成 `managed-provider`
- 也不需要把它加进 exact trusted built-ins
- 只要平台 runtime external contract 足够稳定，它就应该能走 artifact-first

## 9. Required Code Changes

### 9.1 Governance layer

更新 [third-party-dependency-governance.ts](/Users/chenchen/Documents/GitHub/my-app/lib/third-party-dependency-governance.ts)：

- 不再让所有 `soft-allowed` 无条件返回 `runtime-only`
- 对满足条件的 browser-safe packages 返回 compatible-artifact-eligible 决策

### 9.2 Capability classifier

更新 [preview-artifact-jobs.ts](/Users/chenchen/Documents/GitHub/my-app/lib/preview-artifact-jobs.ts)：

- 不要把所有非平台 `runtime-only` bare deps 一律判成 `runtime-only`
- 要允许一部分 `soft-allowed + compatible-external` 进入 `compatible-artifact`

### 9.3 Runtime plan generation

更新 [preview-dependency-provider.ts](/Users/chenchen/Documents/GitHub/my-app/lib/preview-dependency-provider.ts)：

- 为这类依赖真正生成 runtime loading plan
- 不只是保留“类型上是 compatible-external”，而没有 artifact path

## 10. Rollout Plan

### Phase 1

- 先把 `soft-allowed` 分成：
  - `runtime-only`
  - `compatible-artifact eligible`

### Phase 2

- 先拿 `recharts`、`motion` 这类高频浏览器包做验证

### Phase 3

- 根据实际稳定性再扩大 browser-safe compatible lane

## 11. Acceptance Criteria

- 带 `recharts` 的普通 UI 组件不再默认掉进 `runtime-only`
- `soft-allowed` 不再等于“只能 runtime preview”
- 平台可以在不提升为 `managed-provider` 的前提下，让更多组件进入 `compatible-artifact`
- 用户侧 story preview 命中率和打开速度明显改善

## Related

- [Preview Third-Party Dependency Governance Spec](./preview-third-party-dependency-governance-spec.md)
- [Preview Artifact Capability Model Spec](./preview-artifact-capability-model-spec.md)
- [Preview Dependency Provider Refactor Spec](./preview-dependency-provider-refactor-spec.md)

## Document Lifecycle

本文件属于阶段性专项文档。

文档收敛策略：

- governance spec 保持主 spec
- provider refactor spec 保持独立
- 本专项文档在实现稳定后，应并回 governance spec 的 decision table / classification rules

换句话说：

- 本文件现在用于推动 `soft-allowed -> compatible-artifact` 的专项落地
- 长期不应让知识永久散落在多份并行主文档中
