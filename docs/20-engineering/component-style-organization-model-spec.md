Status: proposed
Owner: engineering
Last updated: 2026-04-07
Source of truth: partial

# Component Style Organization Model Spec

## 1. Purpose

本文档定义 Cozy Registry 中组件与样式的推荐组织模型，并评估当前项目对几种常见模式的实际支持情况。

目标不是把所有样式技术统一成一种，而是明确：

- 哪些样式属于 **component-local style**
- 哪些样式属于 **design-context style**
- preview / artifact / install / docs 对这些样式应如何一致处理
- 当前实现已经支持到什么程度，哪些地方还是阶段性缺口

## 2. Core Decision

平台正式支持两层样式来源：

1. **Component-local style**
   - 与组件 bundle 一起发布、一起安装、一起预览
   - 例如：
     - `Button.css`
     - inline style
     - 组件源码中的 Tailwind utility class

2. **Design-context style**
   - 独立于组件 bundle 的设计上下文资源
   - 当前第一优先级是 `registry:theme`
   - 通过：
     - `resource.meta.themeResourceRef`
     - `project.defaultThemeResourceRef`
     解析得到

一句话：

**组件 bundle 负责局部样式，theme 资源负责全局设计上下文。**

## 3. Supported Organization Patterns

### 3.1 Tailwind + external theme variables

示例：

- `Button.tsx` 使用 Tailwind class
- class 中通过 `var(--color-primary)`、`bg-background`、`text-foreground` 等消费主题变量
- `registry:theme` 提供 `theme.css`

适用场景：

- 设计系统组件
- project 级默认主题
- 多组件共享颜色、圆角、间距、字体 token

### 3.2 Co-located CSS with component code

示例：

- `Button.tsx`
- `Button.css`
- `import "./Button.css"`

适用场景：

- 组件专属动画、布局、复杂状态样式
- marketing block
- 不想强依赖 project theme 的自包含组件

### 3.3 Mixed mode

示例：

- `Button.tsx` + `Button.css`
- 同时消费 `registry:theme` 里的 CSS variables

适用场景：

- 真实设计系统中的最常见模式
- 局部样式由组件自带
- 全局 token 由 theme 提供

### 3.4 Theme-driven / token-driven component

示例：

- 组件几乎不带局部样式
- 主要靠 theme variables / tokens 决定视觉

适用场景：

- 强 design-system 约束的基础组件

### 3.5 CSS-in-JS / runtime style injection

示例：

- 运行时创建 style tag
- emotion / styled-components / 类似 runtime styling

适用场景：

- 兼容性支持
- 不作为当前平台主模型

## 4. Formal Semantics

### 4.1 Component-local style

特征：

- 属于 bundle 文件的一部分
- 由组件源码通过本地 import、inline style 或 className 引用
- 缺失时通常属于 **hard dependency / build failure**

典型内容：

- `Button.css`
- `Card.css`
- 动画 keyframes
- 组件局部布局与状态样式

### 4.2 Design-context style

特征：

- 独立于组件 bundle
- 通过 project / resource relationship 解析
- 缺失时通常属于 **degraded preview / docs**, 不是默认 hard build failure

当前唯一正式一等资源：

- `registry:theme`

解析顺序：

1. `resource.meta.themeResourceRef`
2. `project.defaultThemeResourceRef`
3. `none`

这条规则与 [Project Resource Relationship Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/project-resource-relationship-spec.md) 保持一致。

### 4.3 Precedence

在 preview / artifact / docs 中，这里的“优先级”应理解为**概念层职责分工**，而不是浏览器真实 CSS specificity / cascade 规则。

更准确的理解方式是：

1. `platform runtime patch`
   - 仅在 live style preview 草稿态存在
   - 用于临时修改 design-context token 或 theme patch
2. `design-context style`
   - 提供共享变量、design token 与主题上下文
3. `component-local style`
   - 消费并扩展这些变量
   - 负责组件自身布局、状态、动画与局部视觉
4. `instance props / inline style`
   - 可对最终展示做实例级覆盖

说明：

- `theme` 提供的是上下文变量与设计 token，不应默认替代组件局部样式
- component-local style 可以引用 theme variable，但不应默认重写 project-level global token contract
- 最终浏览器里的实际层叠顺序仍取决于具体 CSS 注入位置、selector 与 inline style，而不是本节的抽象职责分层

### 4.4 Host global CSS is not a formal style source

以下来源**不应**被视为 registry preview / artifact / install 的正式样式输入：

- 宿主 app 的 `App.css`
- 宿主 app 的 `globals.css`
- 任意“项目里刚好存在”的全局 CSS 文件

原因：

- 它们不属于组件 bundle
- 它们不属于显式的 design-context resource
- 它们会让 preview contract 重新依赖宿主环境偶然状态

正式规则：

- 如果组件依赖的全局 CSS variables 属于设计上下文，应由用户显式迁移为 `registry:theme`
- 如果这些变量只服务于该组件自身，应把它们放进 bundle-local CSS（例如 `Button.tokens.css`）

不建议平台自动猜测或偷偷注入宿主 `App.css` / `globals.css`，因为这会让 preview、artifact、docs 和 install 的真相重新分裂。

## 5. Build / Preview / Install Contract

### 5.1 Preview

- component-local CSS 应跟随 bundle 进入 preview artifact
- resolved theme CSS 应在 preview runtime 中作为 design-context 注入
- mixed mode 应允许两者同时生效

### 5.2 Artifact

- `managed-artifact` 与 `compatible-artifact` 都应允许包含 component-local CSS
- resolved theme 应被视为 artifact 的正式输入之一
- live style preview 中的 runtime patch 不等于 committed artifact 真相

### 5.3 Install

- component-local files 应随安装一并落盘
- theme 资源在 install protocol 中更适合作为：
  - explicit dependency
  - or project context recommendation
- project default theme 不应在第一阶段自动写回 item-level hard dependency

## 6. Recommended Product Position

平台应把以下两种都视为“正常组件”：

- 自带样式的 bundle
- 消费外部 theme 的 bundle

不要求所有组件都采用 theme-first 模式，也不要求所有组件都自带完整样式。

推荐默认心智：

- **局部样式放 bundle**
- **全局 token 放 theme**

## 7. Current Support Assessment

### 7.1 Tailwind + external theme variables

**当前支持度：partial**

已具备：

- `registry:theme` 已正式存在，支持 `theme.css` 与 `tokens.json -> theme.css` 派生
- project default theme 与 resource-level theme override 已落到数据模型与 API
- 动态 preview route 会解析并注入 resolved theme CSS
- 上传分析会识别 theme-like CSS 与 token-style Tailwind utilities

当前缺口：

- `preview.html` artifact 主路径没有显式引入 Tailwind runtime 或等价的预编译 utility CSS
- `buildArtifactPreviewHtml(...)` 支持 `themeCss` 参数，但 artifact worker 当前没有把 resolved theme CSS 写进构建出的 `preview.html`
- 因此纯 “Tailwind utility class + external theme variable” 在 **动态 fallback preview** 中成立，在 **artifact-first 主路径** 中仍是部分支持

结论：

- **动态 preview：可用**
- **artifact preview：不完整**
- **宿主 `App.css` / `globals.css` 中的变量：不应作为正式依赖来源**

补充说明：

- 这属于**当前 artifact-first 主路径的实现缺口**
- 不代表产品意图不支持 “Tailwind + external theme variables”
- 平台意图上支持该模式；当前问题在于 artifact delivery 尚未完全补齐

### 7.2 Co-located plain CSS (`Button.tsx` + `Button.css`)

**当前支持度：good**

已具备：

- `buildPreviewBundle(...)` 会收集本地 `.css` import，并产出 `preview.css`
- artifact worker 会上传 `preview.css`，`preview.html` 会通过 `<link rel="stylesheet">` 引入
- install protocol 会把 `.css` 文件一并落盘
- 相对 import 在安装时会被重写并保持有效

当前缺口：

- publish-time bundle validation 主要检查 code file，缺失的本地 CSS import 不会在最早阶段被静态发现，而是更晚在 build/smoke 中暴露

结论：

- **plain co-located CSS：已支持，质量较好**

### 7.3 Mixed mode (`Button.css` + external theme)

**当前支持度：partial**

已具备：

- 本地 CSS bundle 路径成立
- 动态 preview route 能注入 resolved theme CSS
- relationship 模型已经允许 project default / resource override

当前缺口：

- artifact worker 尚未把 resolved theme CSS 固化到 `preview.html`
- 因此 mixed mode 在 artifact-first 路径下仍然不完全一致

结论：

- **这是推荐主模型，但 artifact 主路径还需要补齐**

补充说明：

- 这属于**当前 artifact-first 主路径的实现缺口**
- 不代表产品意图不支持 mixed mode
- 平台意图上应把 mixed mode 视为正式推荐模型之一

### 7.3.1 App.css-backed variables

当组件表现为：

- `Button.css` 中的 class 规则生效
- 但其中使用的 `var(--token)` 依赖宿主项目 `App.css` / `globals.css`

当前应视为：

- **component-local CSS 正常**
- **design-context style 未显式建模**

推荐处理方式：

1. 如果这组变量属于可复用设计上下文：
   - 提取并发布为 `registry:theme`
   - 通过 `themeResourceRef` 或 `project.defaultThemeResourceRef` 显式关联
2. 如果这组变量仅服务于当前组件：
   - 放入 bundle-local CSS
   - 例如 `Button.tokens.css`

不推荐的处理：

- 让 preview 自动带上宿主 `App.css`
- 把宿主项目路径当作 registry item 的隐式样式来源

### 7.4 Theme-driven component

**当前支持度：partial**

已具备：

- 单独 `registry:theme` 预览
- theme token 发布与派生 CSS
- preview 状态与详情页已能显示 resolved theme

当前缺口：

- artifact freshness / invalidation 还没有把 theme 变化完整纳入 committed artifact 真相
- install protocol 还没有正式消费 project default theme context

结论：

- **preview 方向已通，artifact/install 仍在收口**

### 7.5 CSS Modules (`*.module.css`)

**当前支持度：limited / not formally supported**

当前现状：

- preview 构建把 `.css` 文件统一抽离为普通 CSS 文本
- 没有完整的 CSS Modules class name 映射语义
- 仓库内已有记录明确写到 `.module.css` 仍非完整支持

结论：

- **不建议当前作为正式推荐模式**

### 7.6 CSS-in-JS / runtime style injection

**当前支持度：compatibility only**

当前现状：

- 平台没有围绕 CSS-in-JS 建正式 contract
- Node-side smoke 与 artifact 一致性会更复杂

结论：

- **可以兼容个别 case，但不应作为当前主路径**

## 8. Key Gaps To Fix

### 8.1 Artifact path must understand design-context style

要让 mixed mode 与 Tailwind + theme 真正成立，artifact worker 需要把 resolved theme CSS 纳入 `preview.html` 或等价 artifact 输入，而不是只在动态 fallback route 注入。

### 8.2 Tailwind utility-only components need an artifact-safe delivery story

当前 artifact `preview.html` 没有动态 route 那种 Tailwind CDN 兜底，因此纯 utility-class 组件在 artifact-first 主路径上的支持不完整。需要二选一：

- artifact-safe Tailwind delivery
- or precomputed utility CSS strategy

### 8.3 CSS Modules should stay explicitly unsupported until real support exists

现有文档里提过 `Input.module.css`，但实现并未提供完整 CSS Modules contract。应继续把它视为未正式支持，而不是“看起来可能可用”。

### 8.4 Install protocol still lacks project-theme context consumption

install 现在能处理 component-local CSS，但还没有把 project default theme 作为正式上下文输入接入安装链路。

### 8.5 Publish / diagnostics should guide users away from host-global CSS

对于检测到大量 `var(--...)` 或 token-style utility，但没有显式 theme relationship 的组件，平台应继续加强提示：

- 当前组件可能依赖宿主全局 CSS
- 推荐把该变量集合迁移成 `registry:theme`
- 或把局部变量文件并入组件 bundle

## 9. Recommended Near-Term Direction

1. 明确 mixed mode 为推荐主模型
2. 修正 artifact worker，把 resolved theme CSS 带入 `preview.html`
3. 为 Tailwind utility-only 组件定义 artifact-safe 方案
4. 在 publish/docs 中明确：
   - plain CSS supported
   - CSS Modules not formally supported
   - CSS-in-JS compatibility only

## 10. References

- [Style And Theme Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/style-and-theme-spec.md)
- [Theme Tokens Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/theme-tokens-spec.md)
- [Project Resource Relationship Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/project-resource-relationship-spec.md)
- [Live Style Preview And Committed Artifact Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/live-style-preview-and-committed-artifact-spec.md)
