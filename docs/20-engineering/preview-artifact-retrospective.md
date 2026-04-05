Status: proposed
Owner: engineering
Last updated: 2026-04-05
Source of truth: yes

# Preview Artifact Retrospective

本文复盘 Cozy Registry preview artifact 体系最近一轮从“重运行时”向“重构建阶段”迁移的设计演进。

目标是总结：

- 我们最初到底在解决什么问题
- 哪些设计选择真正改善了首屏和切换白屏
- 哪些中间层做对了，哪些仍然停留在补丁阶段
- 对后续 preview / provider / compatible lane 工作有哪些经验教训

## 1. Initial State

最初的 preview 主链路更像“请求时动态装配页面”：

- route 请求进入后查 item / version / artifact
- 再读 stories、theme、dependency 信息
- 再决定 import map、HTML、bundle 入口
- 浏览器 iframe 每次打开都像在临时启动一套 preview runtime

这种模式的主要问题：

- 首屏慢
- 请求链长
- iframe 容易白屏
- story / 版本切换容易 cancel / remount
- 前端不得不用更复杂的 iframe swap / keep-alive 逻辑来掩盖后端装配成本

## 2. Core Design Shift

这一轮最重要的变化，不是单个性能 patch，而是心智模型的变化：

- 从 **request-time page assembly**
- 转向 **build-time artifact generation**

也就是说：

- preview 不再被主要视为“请求时生成的 HTML”
- 而开始被视为“构建后分发的产物”

这一步的关键表现包括：

- 产出 `preview.js`
- 产出 `manifest.json`
- 进一步产出完整 `preview.html`
- route 命中 artifact 后尽量直接返回已构建内容
- request-time 逻辑越来越收缩为状态判断和薄入口分发

## 3. What Actually Reduced Load Time

### 3.1 Work moved from request-time to build-time

这是最大收益来源。

过去用户打开 preview 时，服务端还要即时决定：

- 选哪个 story
- 依赖怎么接
- HTML 怎么拼
- import map 怎么生成

现在这些工作越来越多在 build-time 已经完成。

效果是：

- 首屏更像静态资源加载
- 不再像临时启动一套装配链

### 3.2 Artifact-first fast path

随着 artifact fast path 落地，preview route 开始优先：

- 查询 artifact 状态
- 命中 `ready` 时直接返回 `htmlContent` / `htmlUrl`

这很关键，因为用户体感提升不只是“构建更快”，而是：

- 命中时根本不用再构建

### 3.3 Per-story artifact model

story-aware artifact 是这一轮非常关键的基础设施。

它让以下目标成立：

- default story 可预热
- thumbnail 可预热
- 每个 story 可独立 artifact 化
- story 切换不必重新构造同一个 preview 页面

### 3.4 Compatible mode moved closer to artifact-first

即使 compatible external 还没有完全 provider-owned，它也已经不再只是纯请求时推导。

表现为：

- dependency plan 写入 manifest
- compatible external 有更明确的 runtime/import-map contract
- 某些 compatible externals 已经开始尝试 materialize / bundle

这使 compatible mode 从“完全运行时兜底”向“有构建期支撑的兼容 artifact”前进了一步。

## 4. What We Did Right

### 4.1 We redefined the problem correctly

真正正确的问题定义不是：

- “怎么把 preview route 写快一点”

而是：

- “怎么把 preview 变成一个 artifact”

这是这轮工作的最大成功点。

### 4.2 We introduced capability tiers instead of binary success/failure

`managed-artifact / compatible-artifact / runtime-only` 这个能力层模型很重要。

它让系统不再只剩两种命运：

- fully managed
- or unusable

中间的 `compatible-artifact` 是后续把大量普通 UI 组件从 runtime-only 拉回 artifact-first 的关键层。

### 4.3 We began connecting governance with build reality

依赖治理不再只是“允许或禁止”的说明层，而开始和：

- smoke
- artifact build
- runtime import map

形成同一个 contract。

这是后续 provider 化和 compatible lane 继续推进的必要基础。

### 4.4 We optimized for hit rate, not just raw build speed

像：

- artifact fast path
- warm preview artifact targets

这类设计说明系统开始围绕“命中率”而不是“单次构建速度”来优化。

这是一个很重要的成熟标志。

## 5. What Still Showed Up As Patchy

### 5.1 Capability initially risked becoming naming-only

在一段时间里，`compatible-artifact` 虽然在 spec 和 metadata 中存在，但运行路径仍然借用了旧的 `skipped` 语义。

这说明一个重要经验：

- 若中间层 contract 没有真正改变 worker、route、UI 行为
- 它就容易变成“换名字，不换模型”

### 5.2 Provider was still vulnerable to host-environment takeover

尽管 provider 抽象已经出现，但宿主 fallback、host tracing、host-copied package tree 仍然非常强。

这暴露了一个结构性风险：

- 过渡兼容层如果太强，会自然变成实际系统本体

### 5.3 Static artifact fast path introduced new correctness concerns

当系统开始直接返回 artifact HTML 时，也会引入新的边界问题，例如：

- 权限
- visibility / private item 访问控制
- artifact content 与当前 item state 的一致性

也就是说：

- 静态化不仅是性能优化
- 它还会改变 correctness surface

## 6. Why White Screen and Canceled Requests Improved

从用户体感角度，白屏和 canceled request 的减少主要来自三点：

### 6.1 The iframe no longer waits on a dynamic page assembly chain

当 iframe 打开时，它越来越像加载一个已经存在的页面，而不是等待 route 再拼装一个页面。

### 6.2 Story switching increasingly means switching artifact entry

尤其在 per-story artifact 模型下，切换 story 更接近：

- 切换到另一个已有 preview 单元

而不是：

- 重新请求一个动态生成的页面

### 6.3 Frontend complexity can finally shrink instead of grow

随着 artifact 稳定，前端不必继续通过越来越复杂的 iframe 管理逻辑去兜底后端不稳定。

这类“减少兜底层复杂度”的收益，通常会直接体现在：

- 更少 canceled requests
- 更少白屏
- 更少 remount 抖动

## 7. Key Lessons For Future Work

### 7.1 Prefer build-time fixation over request-time assembly

以后再遇到类似性能问题，优先问：

- 这一步能否前移到 build-time
- 能否变成 artifact / manifest / static contract

### 7.2 Keep artifact-first as the main path

fallback 很重要，但 fallback 不应该成为常态。

后续所有 preview 工作都应继续围绕：

- artifact hit rate
- warm coverage
- compatible artifact coverage

### 7.3 Provider must become a real boundary, not a helper layer

这次最大的未竟事项之一，就是 provider 还没有完全成为正式供应边界。

长期必须继续收敛到：

- provider-owned managed assets
- compatible external runtime contract

### 7.4 `compatible-artifact` must continue to be made real

`compatible-artifact` 是中间能力层的核心。

它后续应继续承担：

- 承接 browser-safe 长尾依赖
- 把更多组件从 runtime-only 拉回 artifact-first
- 为 story page / multi-story browsing 提供更稳的基础

### 7.5 Single source of truth matters for page state

在后续 multi-story preview 等工作中，这次也强化了一个结论：

- 页面 query 应是 page state 的唯一 source of truth
- iframe URL 应由页面状态派生
- 不应让 iframe 反向驱动页面状态

### 7.6 Temporary bridges should be labeled early

像下面这些都应尽早被明确标注为 temporary bridge：

- host tracing
- host fallback
- skipped-based compatible path

否则补丁很容易永久化。

## 8. What This Means For The Next Phase

这次演进之后，后续工作的重点不应再是：

- 再继续优化 request-time 拼页面

而应转到：

1. 继续提高 artifact-first 覆盖率
2. 让 provider 真正拥有依赖供应权
3. 让 `compatible-artifact` 成为正式稳定的成功产物
4. 在多 story、gallery、更丰富 preview 浏览体验上继续建立在 per-story artifact 之上

## 9. One-Sentence Summary

这次 preview artifact 功能最重要的设计升级，不是“把构建速度做快了”，而是：

**把 preview 从“请求时动态生成的页面”改造成了“构建后可分发、可缓存、可命中的产物”。**

这是后续一切 preview / provider / compatible lane 工作最重要的基础。

## Related

- [Preview Third-Party Dependency Governance Spec](./preview-third-party-dependency-governance-spec.md)
- [Preview Dependency Provider Refactor Spec](./preview-dependency-provider-refactor-spec.md)
- [Preview Artifact Capability Model Spec](./preview-artifact-capability-model-spec.md)
- [Story Preview UX / Performance Spec](./story-preview-ux-performance-spec.md)
