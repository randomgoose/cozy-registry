Status: draft
Owner: product
Last updated: 2026-04-10
Source of truth: no

# Cozy Starter System Product Note

## 1. 问题

Cozy Registry 当前已经逐渐形成：

- project
- theme layers
- preview artifact
- AI / MCP publish
- design system context

但对于新用户来说，第一步仍然不够自然。

他们往往需要先解决：

- 从什么开始搭
- 用哪套基础组件
- 怎么把样式调到接近自己的品牌
- 怎么从基础组件继续长出业务组件

如果这一步缺少清晰起点，用户即使理解 Cozy 的理念，也未必会真正把日常工作流迁进来。

## 2. 提议

提供一套 **Cozy Starter System**：

- 以现成基础组件体系为底
  - 如 `shadcn`
  - 或 `base-ui`
- 允许用户直接从基础组件开始
- 可以快速调样式 / theme
- 可以继续沉淀为自己的业务组件
- 并天然接入 Cozy 的：
  - project
  - preview
  - artifact
  - theme
  - Figma Make / AI / MCP 工作流

## 3. 核心判断

### 3.1 值得做

这个方向值得做，因为它能解决 Cozy 的冷启动问题，并帮助用户形成使用习惯。

### 3.2 但不应该被定义成“再做一套组件库”

Cozy 不应该把这件事做成：

- 又一个 UI library
- 又一个 design system kit
- 或与 `shadcn` / `base-ui` 正面对打的组件库产品

更合理的定义是：

- **工作流起点**
- **默认 starter system**
- **从基础组件走向业务资产的桥**

## 4. 它真正提供的价值

### 4.1 作为冷启动入口

用户不用先自己准备一整套基础组件，便可以：

- 直接开始搭
- 先调 theme
- 再组合出 block / business components

### 4.2 作为 Cozy 工作流的入口

这套 starter system 的价值不在于 Button 本身，而在于它天然进入 Cozy 主路径：

- project-first
- theme-aware
- preview-ready
- artifact-ready
- AI/MCP-readable

### 4.3 作为从基础组件到业务组件的桥

用户不应被停留在基础组件层。

更理想的路径是：

1. 选一个现成基础组件
2. 调样式和 theme
3. 组合成业务组件或 block
4. 将结果发布回 Cozy
5. 在项目中继续复用、升级、迭代

## 5. 为什么现在值得做

如果 Cozy 只提供：

- 发布
- 预览
- 存放
- 管理

那用户的第一次成功路径仍然偏重，需要先准备自己的资产。

Starter system 可以让用户更快到达：

- “我已经在 Cozy 里做出第一个可用组件/模块”

这比单纯解释理念更容易形成习惯。

## 6. 应该怎么做

### 6.1 以现有体系为底

建议优先基于现成体系：

- `shadcn`
- `base-ui`

而不是从零构建一整套新原子组件。

### 6.2 重心放在可调和可承接

最重要的不是组件数量，而是：

- 能否快速换 theme
- 能否衍生业务组件
- 能否自然发布到 Cozy
- 能否进入 preview / docs / install / AI 工作流

### 6.3 与 Figma Make / AI 接起来

Starter system 最有价值的地方之一，是它可以作为：

- Figma Make 输出后的默认落点
- AI 改样式 / 组合组件的默认素材库
- 用户逐步建立自己 design system 的第一步

## 7. 不该做成什么

### 7.1 不该做成“独立卖点的组件库”

如果它只是：

- 一套好看的基础组件
- 一个漂亮的 showcase

那长期价值有限，也很容易被别的工具或 repo 内组件库替代。

### 7.2 不该分散 Cozy 的主焦点

Cozy 的核心仍然应该是：

- 共享资产层
- design system context layer
- AI-usable component operating layer

Starter system 应服务于这个主方向，而不是替代它。

## 8. 推荐产品定位

建议把这件事定义为：

- **Cozy Starter System**

而不是：

- Cozy UI Library
- Cozy Design System

前者强调：

- 起点
- 过渡
- 工作流入口

后者则容易让人误以为 Cozy 的核心价值是“维护一套组件库”。

## 9. 一句话总结

提供一套可调样式的 starter component system 是值得做的，但它的价值不在于“再做一套组件库”，而在于：

**让用户从基础组件快速起步，逐步长出自己的业务组件和设计系统资产，并自然养成通过 Cozy 进行预览、发布、迭代与多工具协作的习惯。**
