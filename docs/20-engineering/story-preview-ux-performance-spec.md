Status: proposed
Owner: engineering
Last updated: 2026-04-03
Source of truth: yes

# Story Preview UX / Performance Spec

本文定义 Cozy Registry 中 story preview 的产品目标与性能目标。

它不讨论“实时可编辑 playground”能力，而是明确：

- story preview 追求的是什么
- 什么样的系统路径才是正确主路径
- 哪些延迟、命中率和状态语义应被视为成功标准

本文是对以下文档的补充，而不是替代：

- [Preview Stories Spec](./preview-stories-spec.md)：story 数据模型、选择逻辑与 artifact key
- [Preview Build Performance Spec](./preview-build-performance-spec.md)：preview build 性能优化
- [Preview Third-Party Dependency Governance Spec](./preview-third-party-dependency-governance-spec.md)：第三方依赖治理

## 1. Product Positioning

Cozy Registry 的 story preview 不是 `react-live` 式的实时编辑器。

当前阶段的目标是：

- 让已发布组件的 story 快速可看
- 让 story 切换尽量不触发重型服务端构建
- 让 story preview 结果稳定、可复现、可被版本化资产引用

因此系统应优先追求：

- fast open
- fast story switching
- stable artifact delivery

而不是：

- browser-side code editing
- keystroke-level live compilation
- ad hoc sandbox execution

## 2. Core Principle

内部统一 north star：

**已发布 story 的预览，应尽量像打开一个静态页面一样快，而不是像在线编译一样慢。**

这意味着：

- artifact-first 是主路径
- inline build 是 fallback
- story 切换优先命中预构建结果

## 3. Non-Goals

以下能力不属于当前阶段目标：

- 用户在浏览器中直接编辑组件源码并实时运行
- story source 的在线 IDE 体验
- 任意依赖的浏览器端即时安装
- 把 preview 系统做成通用代码沙箱

## 4. UX Goals

### 4.1 Open Fast

当用户打开一个已发布组件详情页时：

- 默认 story 应尽快可见
- 用户不应感知到“正在重新构建整个 preview pipeline”
- 若 artifact 不可用，系统也应快速返回明确状态，而不是长时间空白

### 4.2 Switch Fast

当用户在同一组件内切换 stories 时：

- 默认不应重新触发重型服务端构建
- 应优先切换到另一个已存在的 story artifact
- 若目标 story 尚未完成 artifact，系统应返回清楚的状态而不是模糊 loading

### 4.3 Be Predictable

同一个：

- item
- version
- storyId
- mode

应对应稳定、可复现的 preview 结果。

## 5. Primary System Path

story preview 的主路径必须是：

1. 查 story-aware artifact
2. 命中则直接渲染 artifact
3. 未命中则返回明确状态并异步补建
4. inline build 仅作为兜底 fallback

也就是说：

- `artifact-first` 是主路径
- `build-on-open` 不是主路径

## 6. Performance Targets

以下指标是建议的产品/工程目标，用于指导实现优先级。

### 6.1 Story Open

对于已有 artifact 的 story：

- 首屏可见目标：`< 500ms`

对于未命中 artifact 但状态可查询的 story：

- 状态返回目标：`< 200ms`

对于 fallback inline build：

- 目标：`< 2s`
- 定位：异常路径，而不是常态路径

### 6.2 Story Switching

同组件内切换到另一个已预构建 story：

- 目标：`< 200ms`

同一 story 下切换轻量参数视图（若未来支持）：

- 目标：`< 100ms`

### 6.3 Artifact Hit Rate

建议目标：

- 默认 story artifact 命中率：`> 90%`
- 热门组件 story artifact 命中率：`> 95%`
- fallback inline build 占比：`< 10%`

长期目标：

- fallback inline build 占比：`< 5%`

## 7. State Semantics

story preview 必须有清晰一致的状态语义。

推荐至少包括：

- `ready`
- `running`
- `skipped`
- `failed`

### 7.1 `ready`

- story artifact 已可用
- 可直接渲染

### 7.2 `running`

- story artifact 正在构建
- 前端应显示 “preparing preview” 而不是空白

### 7.3 `skipped`

- 当前 story 可 runtime preview
- 但按依赖策略不生成稳定 prebundle artifact
- 用户提示应为：
  - `runtime preview only`
  - 或 `prebundle skipped by policy`

### 7.4 `failed`

- 真正的构建或渲染失败
- 应显示明确错误，而不是与 `skipped` 混淆

## 8. Story Publish / Build Policy

为了实现“快速可看”，系统应优先预构建这些 story：

- default story
- default thumbnail mode
- 组件详情页最常用 story

后续可扩展：

- 发布后批量 warm 常用 story
- 浏览热度驱动的二次预热

## 9. Dependency Requirements

story preview 的流畅度依赖于第三方依赖治理。

特别是：

- trusted built-ins 必须逐步脱离宿主 `node_modules`
- `prebundle-supported` 依赖应由平台受控提供层稳定解析
- `runtime-only` 依赖应清楚标记为降级模式

否则：

- story open 会不稳定
- artifact hit 不可预测
- 同一 story 在不同宿主环境下可能表现不同

## 10. Product Guidance

在 UI 和产品文案上，应强调：

- 这是 “preview”
- 不是在线编辑器
- 预览目标是快速打开与稳定复现

不应误导用户期待：

- 浏览器内改代码即时运行
- 任意依赖都能像本地 docs 系统一样天然存在

## 11. Engineering Priorities

如果只按优先级排，最重要的是：

1. 提高 story artifact 预生成覆盖率
2. 提高 artifact 命中率
3. 降低 story 切换时的服务端参与度
4. 让 trusted built-ins 的预构建解析稳定化
5. 让 `ready / running / skipped / failed` 状态贯穿一致

## 12. Acceptance Criteria

当这套目标达成时，应满足：

- 已发布组件详情页的默认 story 通常无需重新构建即可打开
- 切换到另一个常用 story 时，体感接近静态页面切换
- 用户不会把 `skipped` 误解为错误
- 同一 item version + storyId 的 preview 结果稳定一致
- fallback inline build 已从主路径退为兜底路径

## Related

- [Preview Stories Spec](./preview-stories-spec.md)
- [Preview Build Performance Spec](./preview-build-performance-spec.md)
- [Preview Third-Party Dependency Governance Spec](./preview-third-party-dependency-governance-spec.md)
- [Component Preview Runtime](./component-preview-runtime.md)
