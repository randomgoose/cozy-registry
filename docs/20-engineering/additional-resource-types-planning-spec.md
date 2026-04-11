Status: draft
Owner: engineering
Last updated: 2026-04-11
Source of truth: no

# Additional Resource Types Planning Spec

本文讨论 Cozy 在现有：

- `registry:block`
- `registry:ui`
- `registry:theme`

之外，是否应该继续扩展新的 resource type，以及 `icon`、`animation`、`image` 这几类资源更适合以什么形式进入系统。

## 1. Core Decision

Cozy 不应该因为“某类资产存在”就立刻把它建成新的 registry item type。

更合理的判断标准是：

### 1.1 适合成为一等 resource type 的条件

某类资源只有在同时满足大部分条件时，才值得成为新的 registry item type：

- 有独立 identity
- 会被多个 item / project 复用
- 值得单独版本化
- 值得单独 preview / inspect / install
- 会作为 `registryDependencies` 的显式依赖出现
- 用户会把它视为“可被管理的资产”，而不是某个 bundle 的内部文件

### 1.2 更适合作为附属资产的条件

如果某类资源更像：

- 某个 block 的实现细节
- 某个组件或页面的局部素材
- 不太需要独立 preview / 独立 install / 独立 lifecycle

那它更适合作为：

- item 内的 file asset
- object storage asset
- bundle-local resource

而不是新的 registry item type。

## 2. Recommended Direction

### 2.1 First-class next candidate

下一类最值得成为一等资源类型的是：

- `registry:icon-set`

### 2.2 Conditional candidate

可能值得成为一等类型，但应分阶段观察的是：

- `registry:animation`
- 或 `registry:motion`

### 2.3 Usually not first-class in v1

图片在大多数情况下不应直接成为一等 registry item type。

更合适的默认模型是：

- 作为 block / page / component 的附属 file asset
- 或作为 object storage media asset

只有在“品牌素材库 / 插画集 / 图像集合”场景下，才值得考虑升级成更强的资源类型。

## 3. Icon

## 3.1 Why icon is different

图标虽然技术上常常也是 React 组件或 SVG 文件，但它和普通 `registry:ui` 的语义不同：

- 数量很多
- 命名稳定
- 复用频率高
- 通常以集合使用
- 更像 design system foundations，而不是单个业务组件

因此，把图标继续塞进 `registry:ui` 会让：

- 列表噪音变大
- 预览心智变差
- install / browse / AI 选择成本升高

## 3.2 Recommended model

推荐引入：

- `registry:icon-set`

一个 item 对应一个图标集合，而不是一个图标一个 item。

### 3.2.1 Packaging

推荐支持两种存储形态：

- 多文件：
  - `icons/arrow-right.svg`
  - `icons/calendar.svg`
- 或代码入口：
  - `index.tsx`
  - `icons/*.tsx`

第一版更推荐多文件 + 生成导出入口。

### 3.2.2 Consumption

`registry:icon-set` 可被：

- `registry:ui`
- `registry:block`
- future starter system

作为显式 dependency 使用。

## 3.3 Preview / browse expectations

`registry:icon-set` 不应要求像普通组件那样只有单一 preview。

更合理的是：

- grid preview
- icon list preview
- name-based search
- maybe single-icon deep link

## 3.4 Recommendation

`icon` 是最值得优先扩展的新类型。

## 4. Animation

## 4.1 Why animation is trickier

动画不是一种单一技术形态，而可能包括：

- Lottie JSON
- Rive binary / state machine
- CSS / JS motion primitive
- video-like motion asset

因此它比 icon 更不适合一开始就做成非常硬的一种资源类型。

## 4.2 Distinguish two categories

建议先区分：

### A. Motion asset

例如：

- Lottie
- Rive
- sprite / timeline asset

这类更像外部 asset。

### B. Motion primitive

例如：

- 可复用 loading animation
- transition primitive
- confetti / number tick / entry motion component

这类更像 code-native UI asset。

## 4.3 Recommended v1 treatment

在第一阶段，不建议急着把所有动画都建成一等类型。

更合理的是：

- 作为 `registry:block` / `registry:ui` 的附属 asset 先支持
- 如果某些 animation 确实需要独立复用，再演进到：
  - `registry:animation`
  - 或 `registry:motion`

## 4.4 When animation becomes first-class

动画只有在满足下面条件时才值得独立成类型：

- 多个 block / page 会共用
- 有独立调参和预览需求
- 值得独立版本化
- 会成为 design system / brand motion 的正式组成部分

## 4.5 Recommendation

animation 应先作为“可上传、可引用的附属资产能力”推进，而不是立即定义成核心新类型。

## 5. Image

## 5.1 Default judgment

图片默认不适合直接成为一等 registry item type。

原因：

- 很多图片只是局部素材
- 多数时候不需要独立 install
- 不需要像 UI / theme 那样进入 registry dependency graph
- 更适合 object storage + metadata

## 5.2 Recommended model

第一阶段建议：

- 图片作为 item 的 file asset 或 media asset
- 由 item/version snapshot 记录其引用关系
- 通过 object storage 分发

## 5.3 When image may deserve stronger modeling

如果未来出现下面场景，可以再讨论更强模型：

- illustration library
- brand image pack
- marketing asset pack
- AI-generated image collections

那时更可能需要的不是单张 `registry:image`，而是：

- `registry:image-set`
- 或更通用的 `registry:media-set`

## 5.4 Recommendation

图片在 v1 / v2 都更适合作为附属媒体资产，而不是立即升成新的 registry item type。

## 6. Proposed Type Roadmap

### 6.1 Current

- `registry:block`
- `registry:ui`
- `registry:theme`

### 6.2 Next likely addition

- `registry:icon-set`

### 6.3 Later conditional additions

- `registry:animation` or `registry:motion`
- `registry:image-set` or `registry:media-set`

## 7. Impact on Existing Systems

如果继续扩类型，需要同步评估这些系统是否支持：

- browse / filters
- project resource relationships
- activities
- preview / artifact behavior
- install protocol
- MCP publish / read tools
- starter kits / starter system

因此新的类型不应轻易引入；每一种都需要明确：

- 它是否值得进入 dependency graph
- 是否值得独立 preview
- 是否值得独立 lifecycle

## 8. Specific Recommendation

当前建议如下：

1. **优先把 `icon` 规划成 `registry:icon-set`**
2. **animation 先作为附属资产支持，再观察是否值得独立成型**
3. **image 默认作为附属媒体资产，不进入一等 registry type**

## 9. One-line Summary

在现阶段，Cozy 不应为了覆盖所有前端素材而快速扩张 resource types。最合理的下一步是优先引入 `registry:icon-set`，同时把 animation 和 image 先按附属资产处理，只在它们真正具有独立 identity、复用、版本化和 preview 价值时，再升级成新的正式类型。
