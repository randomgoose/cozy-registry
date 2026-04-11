Status: draft
Owner: product
Last updated: 2026-04-11
Source of truth: no

# Cozy Starter System V1 Spec

## 1. Problem

Cozy 已逐渐形成较清晰的主路径：

- project
- theme layers
- preview / artifact
- AI / MCP publish
- Figma Make handoff

但对新用户来说，第一步仍然偏重。

用户往往需要先自己解决：

- 从什么基础组件开始
- 用哪套样式基底
- 怎么快速切到自己的品牌和主题上下文
- 怎么从基础组件继续长出业务组件和 block

如果这一层没有默认起点，用户即使认同 Cozy 的方向，也未必能尽快得到第一次成功体验。

## 2. Decision

Cozy 应提供一套 **Starter Kit System** 作为默认冷启动入口。

V1 的定义不是“给每个 project 自动塞一套混合 starter assets”，而是：

- project 创建时明确支持 `empty project` 或 `add starter kit`
- starter content 以可复选 package 形式进入 project
- `primitives`、`blocks`、`theme` 等能力彼此分离，而不是捆成一个包
- 未来可以继续扩展新的 package 类型，例如 `data-vis`
- starter kit 在 V1 中是一次性 project initialization template，而不是持续关联的 source

一句话：

**Starter Kit System V1 要解决的是“如何为一个 project 选择合适起点”，不是“如何拥有一套固定的默认组件库”。**

## 3. Product Role

V1 中，Starter Kit System 的角色是：

- cold-start entry for project creation
- package-based starter selection model
- bridge from base assets to business assets
- default substrate for AI and Figma Make handoff

它不是：

- Cozy 的核心卖点本身
- 与 `shadcn` / `base-ui` 正面对打的独立 UI library
- 一套要求 Cozy 长期从零维护的原子组件系统
- 模板市场或 page builder
- 把所有 starter 内容混成一个不可拆分的“默认 starter project”

## 4. Goals

V1 的目标是：

- 让新用户在创建 project 时明确选择空白起步，或从 starter kit 起步
- 让 starter content 以 package 方式进入 project、theme、preview、artifact 主路径
- 让用户可以只选自己需要的 `theme`、`primitives`、`blocks`
- 让 package 模型未来可以拓展到更多资产类型，例如 `data-vis`
- 让 AI 有一层默认可消费、可组合、可派生的素材
- 让 Figma Make 产物可以更自然映射到 Cozy 内的 primitives package 或 blocks package

## 5. Non-Goals

V1 不做：

- 与 `shadcn` / `base-ui` 全面对齐的组件覆盖率
- 大而全的模板市场
- 复杂 page-builder
- 完整视觉编辑器
- 自动替代用户已有 design system
- 强行要求所有用户迁移到 Cozy Starter Kit
- 把 `primitives` 和 `blocks` 绑定成必须一起安装的单一包

## 6. Primary Users And Jobs

### 6.1 New project owner

用户需要：

- 创建 project 时明确决定是空白开始，还是添加 starter kit
- 如果选择 starter kit，只添加自己当前需要的 package
- 先换 theme，再做第一个业务组件或 block
- 不需要先组装自己的底层 UI 基础设施

### 6.2 Existing project maintainer

用户需要：

- 给已有 project 补一个可复用的 starter baseline
- 从现成基础组件快速沉淀业务组件
- 在不推翻现有代码和主题的前提下逐步迁入 Cozy 上下文

### 6.3 AI agent

AI 需要：

- 有稳定的 starter assets 可读、可组合、可派生
- 知道当前 project 启用了哪些 kit packages
- 知道应该优先基于哪些 primitives package 或 blocks package 进行生成
- 能把结果发布为 project 内的 canonical item

### 6.4 Figma Make user

用户需要：

- 有一个默认落点承接 Figma Make 生成代码
- 能把原始产物映射到 starter primitives package 或 blocks package
- 在 Cozy 中继续修正 theme、preview 和结构，再发布为正式资产

## 7. V1 Principles

### 7.1 Build on existing systems

V1 以现有体系为底：

- `shadcn`
- `base-ui`

Starter Kit System 应优先复用这些生态中已被广泛验证的交互和无障碍能力，而不是从零发明。

### 7.2 Theme-first, not showcase-first

Starter Kit System 的价值不在于默认样式有多漂亮，而在于它能让用户快速切到自己的主题上下文。

### 7.3 Registry-native assets

Starter Kit System 中的资产应天然符合 Cozy 主路径：

- project-aware
- preview-ready
- artifact-ready
- theme-layer-aware
- AI-readable

### 7.4 Package composition over monolith

V1 应将 starter content 组织为可组合 package，而不是一个不可拆分的大 starter bundle。

### 7.5 Encourage derivation, not lock-in

Starter Kit 不是终点。V1 应鼓励用户从 starter asset 派生出自己的 business components 和 blocks。

### 7.6 Prefer minimal completeness over broad coverage

V1 应优先做一条完整路径，而不是堆很多组件名录。

## 8. Recommended V1 Scope

V1 只做最小但完整的一组高频 package。

### 8.1 Theme package

- color tokens
- typography tokens
- radius tokens
- spacing tokens

### 8.2 Primitives package

- Button
- Input
- Textarea
- Label
- Select
- Checkbox
- Radio Group
- Switch
- Dialog
- Dropdown Menu
- Tabs
- Card
- Badge
- Tooltip

### 8.3 Layout primitives package

- Page Header
- Section
- Empty State
- Form Row
- Toolbar

### 8.4 Blocks package

V1 可支持少量高频 block，但应作为独立 package 出现：

- Settings Form Block
- Table Toolbar Block
- Stat Card Block
- Marketing Hero Block

这些 block 的目的不是做模板市场，而是演示“基础组件如何长成业务资产”。

### 8.5 Extensible package types

V1 的 package 结构应为后续扩展留口，例如：

- `data-vis`
- motion / animation
- app-shell patterns
- domain starter packs

## 9. Asset And Packaging Model

### 9.1 First-party starter kits

推荐由 Cozy 提供 first-party starter kits，作为默认入口。

V1 推荐采用以下模型：

- Cozy 提供一个或少量 starter kits
- 每个 starter kit 由多个可复选 package 组成
- 用户在 project 创建时选择 `empty` 或 `add starter kit`
- 若选择 starter kit，用户可勾选要添加的 package
- starter kit 的内容在创建时直接成为 project 初始内容
- 创建完成后，这些内容与用户后续自己添加的 project 内容没有本质区别
- V1 不要求保留 project 与 starter source 的持续关联

这样可以同时满足：

- 默认起步快
- kit/package 结构清晰
- 用户结果仍然回到自己的 project context
- 不引入 kit sync、source 绑定、升级继承等额外复杂度

### 9.2 Package taxonomy

V1 至少应支持以下 package taxonomy：

- `theme`
- `primitives`
- `blocks`

未来可扩展：

- `data-vis`
- `patterns`
- `templates`

### 9.3 Canonical item model

所有正式被用户继续使用和发布的结果，都应成为当前 project 下的 canonical item，而不是临时 attach 关系。

### 9.4 Theme organization

V1 推荐直接使用 ordered theme layers：

- project default theme layers 提供基础 design context
- 组件可追加自己的 theme layers，但不鼓励无意义分叉

Theme package 建议拆成：

- base theme
- optional semantic / component token layer

## 10. Default User Experience

### 10.1 Project creation flow

推荐默认路径：

1. 用户创建 project
2. Cozy 提供两种入口：`empty project` 或 `add starter kit`
3. 如果用户选择 starter kit，先选择 kit，再勾选要添加的 package
4. 若选中 `theme` package，Cozy 将其写入 project default theme context
5. 用户从已添加的 primitives package 或 blocks package 开始派生
6. 派生结果发布为当前 project asset

### 10.2 Empty project flow

如果用户选择 `empty project`：

1. 创建空 project
2. 不预装 starter content
3. 用户可在后续任意时间再添加 starter kit package

### 10.3 Existing project flow

对于已有 project：

1. 用户可为 project 添加 starter kit package
2. 单独选择 theme、primitives 或 blocks package
3. 从已安装 package 派生业务组件
4. 在 preview 中验证
5. 发布为 project 内新 asset

### 10.4 Desired first success

V1 追求的第一次成功体验应是：

**用户在创建 project 时选定空白或 starter kit，并在几分钟内基于所选 package 做出并发布第一个业务组件或 block。**

## 11. Theme And Style Integration

### 11.1 Preferred style model

Starter Kit System V1 应显式支持：

- Tailwind classes + external theme variables
- component-local CSS + external theme variables
- mixed mode

### 11.2 User-facing guidance

Starter Kit System 应帮助用户理解两层样式来源：

- bundle-local style
- design-context theme layers

不应把宿主 `globals.css` 作为正式依赖来源。

### 11.3 Theme customization path

V1 应给出清晰默认路径：

1. 复制或派生 theme package
2. 调整 brand colors / typography / radius / spacing
3. 让 starter UI 自动继承 project theme layers
4. 再从 starter UI 组合业务组件和 block

## 12. Preview And Artifact Requirements

Starter kit packages 中的基础组件和 block 必须天然接入 Cozy 的 preview 主路径：

- per-item preview
- per-story preview
- artifact-first preview
- theme-aware preview

V1 的要求不是把每个 starter asset 做成复杂 docs 站，而是：

- 每个 starter asset 至少有一个稳定 preview
- 高价值组件应有多个 story
- block 应展示真实组合效果
- theme package 切换后，preview 中能明显看到上下文变化

## 13. AI Workflow Entry

Starter Kit System 对 AI 的价值，主要是作为默认素材层和默认操作面。

### 13.1 What AI should be able to do

- 从 starter Button 派生出业务 Button
- 用 starter Dialog / Form primitives 组合出业务 block
- 根据 project theme context 调整 selected starter packages
- 将结果发布为新的 canonical project item

### 13.2 What V1 should avoid

V1 不要求 AI 一开始就深度修改整套基础组件实现。

更现实的路径是：

- AI 先消费 selected starter packages
- 再组合、派生、调样式
- 最后发布新的业务资产

## 14. Figma Make Entry

Starter Kit System 应作为 Figma Make handoff 的默认落点之一。

### 14.1 Desired workflow

1. 用户从 Figma Make 生成初步代码
2. Cozy 将其映射到 starter primitives package 或 blocks package
3. 用户或 AI 在 Cozy 中继续修正 theme / preview / structure
4. 最终发布为 project asset

### 14.2 Why this matters

这样设计产出不会停留在原型工具内部，而会自然流向：

- canonical item
- project context
- theme layers
- preview artifact

## 15. Product Requirements

### 15.1 Project creation choice

创建 project 时，系统应明确提供：

- `empty project`
- `add starter kit`

### 15.2 Package-based selection

Starter kit 的选择单位应是 package，而不是整包不可拆分 starter project。

V1 至少支持：

- `theme`
- `primitives`
- `blocks`

### 15.3 Explicit derive action

用户从 starter asset 开始时，应有清晰的 derive / copy / publish 语义，避免误以为自己在直接编辑共享 starter source。

### 15.4 Theme-first onboarding

如果用户选择了 `theme` package，系统应优先引导其选择或调整主题，而不是先展示大量资产列表。

### 15.5 Preview coverage

V1 中所有 starter assets 必须具备足够稳定的 preview 能力，保证它们不仅是“可安装”，而且是“可看、可比较、可被 AI 理解”。

### 15.6 Publish destination

所有由 starter assets 派生出的正式结果，都应能明确发布到当前 project，并保有清晰的来源语义。

## 16. Acceptance Criteria

V1 完成时，至少满足以下条件：

1. 用户创建 project 时，能明确选择 `empty project` 或 `add starter kit`
2. 用户若选择 starter kit，能按 package 勾选 `theme`、`primitives`、`blocks`
3. 用户能只安装其中一个 package，而不是被迫安装整包
4. 用户能为 project 选择 theme package，并在 preview 中看到明确变化
5. 用户能从 selected starter package 派生出 project 内的新业务组件或 block
6. 派生结果能进入 preview、artifact 和 publish 主路径
7. AI 能稳定读取 selected starter packages，并基于它们派生后发布新 asset
8. Figma Make 产出有清晰的 package-based 承接叙事

## 17. Success Criteria

V1 成功的标志不是“组件数量很多”，而是：

- 新用户可以在 Cozy 内做出第一个可用组件或 block
- 用户能在 1 个 project 中按需选择 kit packages，而不是接受整包默认资产
- 用户能快速切换 theme package 并看到预览
- AI 可以稳定从 selected starter packages 派生和发布业务组件
- Figma Make 产出能更自然落到 starter-package-based project assets
- 用户开始把 Cozy 当成资产起点，而不只是资产展示页

## 18. Recommended Rollout

### Phase 1

- project creation choice: `empty` / `starter kit`
- theme package
- primitives package
- preview integration
- package-based starter entry

### Phase 2

- blocks package
- AI 派生 workflow
- Figma Make handoff guidance

### Phase 3

- richer package taxonomy，例如 `data-vis`
- project-level starter presets
- richer story coverage
- stronger install / docs integration

## 19. Open Decisions

仍需继续拍板的问题：

1. V1 首发是否只提供一个 starter kit，还是允许多个 starter kits
2. theme package 是否只提供一套默认基底，还是提供少量风格变体
3. derive 语义在 UI 上应优先使用 copy、fork 还是 publish-as-new
4. blocks package 是否与 primitives package 同步首发，还是延后到第二阶段
5. package 安装后在 project 中应呈现为“已启用能力”，还是“已导入 starter assets”
6. `data-vis` 这类新 package type 的元数据模型是否与现有 UI/block/theme 完全共用

## 20. Related Docs

- [Cozy Starter System Product Note](/Users/chenchen/Documents/GitHub/my-app/docs/10-product/cozy-starter-system-product-note.md)
- [Phase 1 Plan](/Users/chenchen/Documents/GitHub/my-app/docs/10-product/phase-1-plan.md)
- [Project-First Publishing Default Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/project-first-publishing-default-spec.md)
- [Style And Theme Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/style-and-theme-spec.md)
- [Project-Scoped Registry Identity Spec](/Users/chenchen/Documents/GitHub/my-app/docs/20-engineering/project-scoped-registry-identity-spec.md)

## 21. One-line Summary

Cozy Starter Kit System V1 的目标不是提供另一套独立组件库，而是让用户在创建 project 时明确选择空白起步或按需添加 starter packages，并让这些 package 天然进入 Cozy 的 project、preview、artifact、AI 和多工具协作工作流。
